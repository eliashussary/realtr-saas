import { type Plan, getPlan } from "./plans"

// Entitlement resolver (M6, ADR 0008). Pure — maps a tenant's local subscription mirror to the
// capability set that server mutations and the worker enforce. Stripe is the source of truth; this
// never calls Stripe or the DB.

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due" // payment failed, within grace: read-only + leads off, site still served
  | "grace" // synonym for past_due until graceEndsAt; kept distinct for readability
  | "lapsed" // grace elapsed: worker unpublishes the site
  | "canceled"
  | "none"

export interface SubscriptionState {
  planId: PlanIdOrUnknown
  status: SubscriptionStatus
}

type PlanIdOrUnknown = string

export interface Entitlements {
  status: SubscriptionStatus
  /** Full read/write standing (active or trialing). */
  inGoodStanding: boolean
  canEditSite: boolean
  canPublish: boolean
  canCaptureLeads: boolean
  canManageIntegrations: boolean
  /** Custom domains the tenant may attach right now (0 when not in good standing). */
  customDomains: number
  /** Members covered before per-seat billing applies. */
  includedMembers: number
  /** Team: members beyond `includedMembers` are billable rather than blocked. */
  meteredSeats: boolean
  /** Hard member cap (`null` = uncapped, extra seats billable). */
  memberCap: number | null
}

// Pre-billing tenants (no subscription row yet) are fully permissive. Enforcement and trial backfill
// arrive in M6-A5; until then the resolver must never lock an existing pilot tenant out. Callers in
// M6-A1 read entitlements but do not yet block on them ("wired permissive").
export const UNMANAGED: Entitlements = {
  status: "none",
  inGoodStanding: true,
  canEditSite: true,
  canPublish: true,
  canCaptureLeads: true,
  canManageIntegrations: true,
  customDomains: 1,
  includedMembers: 1,
  meteredSeats: false,
  memberCap: null,
}

function fromPlan(plan: Plan, status: SubscriptionStatus): Entitlements {
  const good = status === "active" || status === "trialing"
  return {
    status,
    inGoodStanding: good,
    canEditSite: good,
    canPublish: good,
    canCaptureLeads: good,
    canManageIntegrations: good,
    customDomains: good ? plan.customDomains : 0,
    includedMembers: plan.includedMembers,
    meteredSeats: plan.additionalSeatPriceCents > 0,
    memberCap: plan.memberCap,
  }
}

/**
 * Resolve a subscription mirror to its capability set.
 * - `null` (no subscription) → permissive `UNMANAGED` so pre-billing tenants keep working.
 * - unknown `planId` → permissive defaults with the real status preserved (defensive; a plan should
 *   always resolve once the catalog and Stripe prices agree).
 */
export function resolveEntitlements(sub: SubscriptionState | null): Entitlements {
  if (!sub) return UNMANAGED
  const plan = getPlan(sub.planId)
  if (!plan) return { ...UNMANAGED, status: sub.status }
  return fromPlan(plan, sub.status)
}
