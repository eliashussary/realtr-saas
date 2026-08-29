import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { subscription } from "./schema"
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
