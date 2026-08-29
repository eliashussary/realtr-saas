import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { billingEvent, subscription } from "./schema"
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
