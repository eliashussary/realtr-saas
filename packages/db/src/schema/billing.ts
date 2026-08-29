import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { organization } from "./auth"

// Billing mirror (M6, ADR 0008). Stripe is the source of truth; this table is written ONLY from
// Stripe webhooks (M6-A3), never optimistically from client state. One subscription per org.
//
// `status` is the local lifecycle mirror derived from Stripe status + `graceEndsAt`:
//   trialing | active | past_due | grace | lapsed | canceled | none
// past_due/grace => dashboard read-only + leads off, site still served; lapsed => site unpublished.
export const subscription = pgTable(
  "subscription",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    planId: text().notNull().default("solo"), // solo | team (see @realtr/core plan catalog)
    status: text().notNull().default("none"),
    // Seat quantity billed on Team (members beyond the included count). Derived from membership and
    // pushed to Stripe on member change (M6-A5); mirrored back here from the webhook.
    seatQuantity: integer().notNull().default(0),
    currentPeriodEnd: timestamp(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
    // When the grace window ends and the worker unpublishes (M6-A4). Null unless in past_due/grace.
    graceEndsAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("subscription_customer_idx").on(t.stripeCustomerId),
    // The worker sweeps subscriptions whose grace window has elapsed to unpublish their sites.
    index("subscription_grace_idx").on(t.graceEndsAt),
  ],
)

// Stripe event ledger for webhook idempotency (M6-A3). Presence of a Stripe `event.id` means it has
// already been applied; replays are acked and ignored. State is always re-fetched from Stripe on a
// new event (never trusted from the payload), so out-of-order delivery converges.
export const billingEvent = pgTable("billing_event", {
  stripeEventId: text().primaryKey(),
  type: text().notNull(),
  organizationId: text().references(() => organization.id, { onDelete: "set null" }),
  receivedAt: timestamp().notNull().defaultNow(),
})
