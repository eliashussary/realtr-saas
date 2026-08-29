import type { SubscriptionStatus } from "./entitlements"

// Stripe webhook convergence (M6-A3, ADR 0008). Pure of the Stripe SDK and the DB: it drives a set of
// injected ports, so replay and out-of-order behavior are unit-tested offline with fakes. The real
// Stripe adapter (signature verification + subscription fetch) lives in stripe-gateway.ts; the app
// route wires the DB ports.
//
// Convergence rule (ADR 0008): every event triggers a *re-fetch* of the subscription's current truth
// from Stripe; local state is written from that fetched object, never from the event payload. Combined
// with the event-id ledger, replays are ignored and out-of-order delivery cannot regress state.

/** Card-required-trial length is a checkout concern; grace is the post-failure window (ADR: 7 days). */
export const DEFAULT_GRACE_DAYS = 7

/** The parsed, verified event handed to the converger — only what convergence needs. */
export interface BillingWebhookEvent {
  id: string
  type: string
  /** The subscription this event concerns, when derivable; null for events we don't act on. */
  subscriptionId: string | null
  /** The customer this event concerns, used to resolve the org when subscription metadata is absent. */
  customerId: string | null
}

/** Normalized snapshot of Stripe's current subscription truth (re-fetched, never from the payload). */
export interface SubscriptionSnapshot {
  subscriptionId: string
  customerId: string
  /** From subscription metadata (set at checkout); null falls back to a customer→org lookup. */
  organizationId: string | null
  /** From subscription metadata; null preserves the previously mirrored plan. */
  planId: string | null
  /** Raw Stripe subscription status. */
  status: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Additional (billable) seats beyond the plan's included count; 0 for Solo. */
  seatQuantity: number
}

/** What the mirror row is set to. Written only here (from re-fetched truth). */
export interface SubscriptionMirrorWrite {
  organizationId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  planId: string
  status: SubscriptionStatus
  seatQuantity: number
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  graceEndsAt: Date | null
}

/** Just enough of the previous mirror to preserve the grace deadline and plan across events. */
export interface PreviousMirror {
  status: SubscriptionStatus
  planId: string
  graceEndsAt: Date | null
}

export interface BillingWebhookDeps {
  /** True if this Stripe event id has already been applied (ledger hit) → treat as a replay. */
  isDuplicate(eventId: string): Promise<boolean>
  /** Append the event id to the ledger so future replays are ignored. */
  recordEvent(input: {
    eventId: string
    type: string
    organizationId: string | null
  }): Promise<void>
  /** Re-fetch the subscription's current truth from Stripe. */
  fetchSubscription(subscriptionId: string): Promise<SubscriptionSnapshot | null>
  /** Resolve an org from a Stripe customer id when subscription metadata lacks it. */
  resolveOrgByCustomer(customerId: string): Promise<string | null>
  /** Load the current mirror for an org (to preserve the grace deadline / plan). */
  loadMirror(organizationId: string): Promise<PreviousMirror | null>
  /** Upsert the mirror row for an org. */
  writeMirror(state: SubscriptionMirrorWrite): Promise<void>
  /** Grace window length in days (defaults to ADR 0008's 7). */
  graceDays?: number
  /** Injectable clock for deterministic tests. */
  now?: () => Date
}

export type BillingWebhookOutcome =
  | { applied: true; organizationId: string; status: SubscriptionStatus }
  | { applied: false; reason: "duplicate" | "no_subscription" | "not_found" | "no_org" }

const GRACE_STATES: ReadonlySet<SubscriptionStatus> = new Set(["past_due", "grace"])

/**
 * Map a raw Stripe subscription status to the local lifecycle status. Stripe is the source of truth;
 * A3 mirrors the payment state and sets the grace deadline. The grace→lapsed transition after the
 * deadline is a worker sweep (M6-A4), not something a single event decides.
 */
export function mapStripeStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case "trialing":
      return "trialing"
    case "active":
      return "active"
    case "past_due":
    case "unpaid": // retries exhausted; still recoverable until the grace sweep lapses it (A4)
      return "past_due"
    case "canceled":
      return "canceled"
    // incomplete / incomplete_expired / paused: no entitlement granted, not yet a paying subscription.
    default:
      return "none"
  }
}

/**
 * Compute the grace deadline for a status transition. Entering a grace state anchors the deadline at
 * `now + graceDays` and *preserves* an existing deadline across Stripe's retry events (so repeated
 * `past_due` events cannot keep pushing lapse out). Leaving a grace state clears it.
 */
export function nextGraceEndsAt(
  status: SubscriptionStatus,
  previous: PreviousMirror | null,
  now: Date,
  graceDays: number,
): Date | null {
  if (!GRACE_STATES.has(status)) return null
  if (previous && GRACE_STATES.has(previous.status) && previous.graceEndsAt) {
    return previous.graceEndsAt
  }
  return new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000)
}

/** Build the mirror write from re-fetched truth + the previous mirror. Pure. */
export function snapshotToMirror(
  snapshot: SubscriptionSnapshot,
  organizationId: string,
  previous: PreviousMirror | null,
  now: Date,
  graceDays: number,
): SubscriptionMirrorWrite {
  const status = mapStripeStatus(snapshot.status)
  return {
    organizationId,
    stripeCustomerId: snapshot.customerId,
    stripeSubscriptionId: snapshot.subscriptionId,
    planId: snapshot.planId ?? previous?.planId ?? "solo",
    status,
    seatQuantity: snapshot.seatQuantity,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    graceEndsAt: nextGraceEndsAt(status, previous, now, graceDays),
  }
}

/**
 * Apply one verified Stripe webhook event to the local mirror, converging to Stripe's current truth.
 * Idempotent (ledger-deduped) and order-independent (always re-fetches). Non-subscription and
 * unresolvable events are still recorded so their replays are cheap.
 */
export async function handleBillingWebhook(
  event: BillingWebhookEvent,
  deps: BillingWebhookDeps,
): Promise<BillingWebhookOutcome> {
  if (await deps.isDuplicate(event.id)) return { applied: false, reason: "duplicate" }

  const graceDays = deps.graceDays ?? DEFAULT_GRACE_DAYS
  const now = (deps.now ?? (() => new Date()))()

  if (!event.subscriptionId) {
    await deps.recordEvent({ eventId: event.id, type: event.type, organizationId: null })
    return { applied: false, reason: "no_subscription" }
  }

  const snapshot = await deps.fetchSubscription(event.subscriptionId)
  if (!snapshot) {
    await deps.recordEvent({ eventId: event.id, type: event.type, organizationId: null })
    return { applied: false, reason: "not_found" }
  }

  const organizationId =
    snapshot.organizationId ??
    (event.customerId ? await deps.resolveOrgByCustomer(event.customerId) : null) ??
    (await deps.resolveOrgByCustomer(snapshot.customerId))
  if (!organizationId) {
    await deps.recordEvent({ eventId: event.id, type: event.type, organizationId: null })
    return { applied: false, reason: "no_org" }
  }

  const previous = await deps.loadMirror(organizationId)
  const mirror = snapshotToMirror(snapshot, organizationId, previous, now, graceDays)
  await deps.writeMirror(mirror)
  await deps.recordEvent({ eventId: event.id, type: event.type, organizationId })

  return { applied: true, organizationId, status: mirror.status }
}
