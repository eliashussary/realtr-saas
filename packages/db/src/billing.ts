import { and, desc, eq, lt } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { billingEvent, organization, subscription } from "./schema"
import type * as schema from "./schema"

// Subscription mirror repository (M6). The full lifecycle is written by webhooks (M6-A3); M6-A2 only
// needs to read the current row and persist the Stripe customer id when checkout provisions one.
export type BillingDatabase = NodePgDatabase<typeof schema>
export type SubscriptionRow = typeof subscription.$inferSelect

export async function getSubscriptionByOrg(
  database: BillingDatabase,
  organizationId: string,
): Promise<SubscriptionRow | null> {
  const [row] = await database
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

/**
 * Persist the Stripe customer id for an org, creating the mirror row if the first webhook has not
 * landed yet (status stays "none" until a subscription webhook fills the rest). Idempotent.
 */
export async function saveStripeCustomerId(
  database: BillingDatabase,
  organizationId: string,
  stripeCustomerId: string,
): Promise<void> {
  await database
    .insert(subscription)
    .values({ organizationId, stripeCustomerId, status: "none" })
    .onConflictDoUpdate({
      target: subscription.organizationId,
      set: { stripeCustomerId, updatedAt: new Date() },
    })
}

// --- Webhook convergence side (M6-A3): the ledger + customer→org lookup + mirror upsert ---

/** True if this Stripe event id has already been applied (ledger hit → replay). */
export async function hasBillingEvent(
  database: BillingDatabase,
  stripeEventId: string,
): Promise<boolean> {
  const [row] = await database
    .select({ id: billingEvent.stripeEventId })
    .from(billingEvent)
    .where(eq(billingEvent.stripeEventId, stripeEventId))
    .limit(1)
  return row != null
}

/**
 * Append an event id to the ledger. `onConflictDoNothing` makes concurrent duplicate deliveries safe
 * even without the pre-check, since `stripeEventId` is the primary key.
 */
export async function recordBillingEvent(
  database: BillingDatabase,
  input: { stripeEventId: string; type: string; organizationId: string | null },
): Promise<void> {
  await database
    .insert(billingEvent)
    .values({
      stripeEventId: input.stripeEventId,
      type: input.type,
      organizationId: input.organizationId,
    })
    .onConflictDoNothing({ target: billingEvent.stripeEventId })
}

/** Resolve an org from a Stripe customer id via the mirror row that stored it (set at checkout). */
export async function findOrgByStripeCustomerId(
  database: BillingDatabase,
  stripeCustomerId: string,
): Promise<string | null> {
  const [row] = await database
    .select({ organizationId: subscription.organizationId })
    .from(subscription)
    .where(eq(subscription.stripeCustomerId, stripeCustomerId))
    .limit(1)
  return row?.organizationId ?? null
}

export interface SubscriptionMirror {
  organizationId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  planId: string
  status: string
  seatQuantity: number
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  graceEndsAt: Date | null
}

/** Upsert the subscription mirror for an org from re-fetched Stripe truth (webhook-only writer). */
export async function writeSubscriptionMirror(
  database: BillingDatabase,
  mirror: SubscriptionMirror,
): Promise<void> {
  await database
    .insert(subscription)
    .values({ ...mirror, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: subscription.organizationId,
      set: {
        stripeCustomerId: mirror.stripeCustomerId,
        stripeSubscriptionId: mirror.stripeSubscriptionId,
        planId: mirror.planId,
        status: mirror.status,
        seatQuantity: mirror.seatQuantity,
        currentPeriodEnd: mirror.currentPeriodEnd,
        cancelAtPeriodEnd: mirror.cancelAtPeriodEnd,
        graceEndsAt: mirror.graceEndsAt,
        updatedAt: new Date(),
      },
    })
}

// --- Grace→lapse sweep (M6-A4): the worker's repository over the @realtr/core lifecycle engine ---

export interface GraceCandidateRow {
  organizationId: string
  status: string
  graceEndsAt: Date | null
}

/**
 * Repository for the grace sweep (structurally implements @realtr/core's GraceSweepRepository). The
 * candidate query is a coarse prefilter on the `subscription_grace_idx`; the engine applies the tested
 * `shouldLapse` predicate. `markLapsed` is guarded to `past_due` so a subscription that recovered to
 * active between the query and the write is never clobbered.
 */
export function createGraceSweepRepository(database: BillingDatabase) {
  return {
    async listGraceCandidates(now: Date): Promise<GraceCandidateRow[]> {
      return database
        .select({
          organizationId: subscription.organizationId,
          status: subscription.status,
          graceEndsAt: subscription.graceEndsAt,
        })
        .from(subscription)
        .where(and(eq(subscription.status, "past_due"), lt(subscription.graceEndsAt, now)))
    },

    async markLapsed(organizationId: string): Promise<void> {
      await database
        .update(subscription)
        .set({ status: "lapsed", updatedAt: new Date() })
        .where(
          and(eq(subscription.organizationId, organizationId), eq(subscription.status, "past_due")),
        )
    },
  }
}

// --- Support reconciliation (M6-A6): read-side + one operational action for the super-admin console ---

export interface AdminSubscriptionRow {
  organizationId: string
  organizationName: string
  status: string
  planId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  seatQuantity: number
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  graceEndsAt: Date | null
}

/** Every tenant's subscription mirror joined to its org, for reconciliation (tenant ↔ Stripe). */
export async function listSubscriptionsForAdmin(
  database: BillingDatabase,
): Promise<AdminSubscriptionRow[]> {
  return database
    .select({
      organizationId: subscription.organizationId,
      organizationName: organization.name,
      status: subscription.status,
      planId: subscription.planId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      seatQuantity: subscription.seatQuantity,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      graceEndsAt: subscription.graceEndsAt,
    })
    .from(subscription)
    .innerJoin(organization, eq(organization.id, subscription.organizationId))
    .orderBy(organization.name)
}

/** The most recent Stripe events applied for an org (the event history for reconciliation). */
export async function recentBillingEvents(
  database: BillingDatabase,
  organizationId: string,
  limit = 10,
): Promise<Array<{ stripeEventId: string; type: string; receivedAt: Date }>> {
  return database
    .select({
      stripeEventId: billingEvent.stripeEventId,
      type: billingEvent.type,
      receivedAt: billingEvent.receivedAt,
    })
    .from(billingEvent)
    .where(eq(billingEvent.organizationId, organizationId))
    .orderBy(desc(billingEvent.receivedAt))
    .limit(limit)
}

/**
 * Operational grace extension (support "give them more time"): push a past_due tenant's grace deadline
 * out so the sweep won't lapse them yet. Guarded to past_due; grace is a local concept, so this does
 * not fight Stripe (a real comp is a Stripe coupon, out of local scope).
 */
export async function extendSubscriptionGrace(
  database: BillingDatabase,
  organizationId: string,
  graceEndsAt: Date,
): Promise<void> {
  await database
    .update(subscription)
    .set({ graceEndsAt, updatedAt: new Date() })
    .where(
      and(eq(subscription.organizationId, organizationId), eq(subscription.status, "past_due")),
    )
}
