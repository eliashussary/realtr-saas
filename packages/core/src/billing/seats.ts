import type { Entitlements } from "./entitlements"
import { getPlan } from "./plans"

// Note: db / Stripe are imported dynamically inside syncSeatsForOrg so this module (and the pure
// evaluateInvite) loads without a DATABASE_URL — it is unit-tested offline.

// Team seat billing (M6-A5, ADR 0008). Two concerns:
//  1) evaluateInvite — a pure gate deciding whether an invite is allowed, blocked, or needs the owner
//     to confirm an added per-seat charge. Solo is a hard cap of 1; Team has no cap, only a cost.
//  2) syncSeatsForOrg — after membership changes, push the derived seat quantity to Stripe. The mirror
//     reflects it back via the resulting subscription.updated webhook (never optimistically).

export type InviteDecision =
  | { kind: "allow" }
  | { kind: "block"; code: "payment_required" | "seat_limit" }
  | { kind: "confirm"; addedMonthlyCents: number }

/**
 * Decide an invite given the org's entitlements, how many seats are already used (members + pending
 * invitations), and whether the owner confirmed a per-seat charge. `usedSeats` is the count *before*
 * this invite.
 */
export function evaluateInvite(input: {
  entitlements: Entitlements
  usedSeats: number
  confirmed: boolean
}): InviteDecision {
  const { entitlements: e, usedSeats, confirmed } = input

  // Not in good standing (past_due/grace/lapsed/canceled on a real plan): no new members until paid.
  // UNMANAGED (pre-billing) is inGoodStanding, so pilots are unaffected.
  if (!e.inGoodStanding) return { kind: "block", code: "payment_required" }

  // Hard member cap (Solo = 1): the only way past it is upgrading to Team.
  if (e.memberCap !== null && usedSeats >= e.memberCap) return { kind: "block", code: "seat_limit" }

  // Team: inviting beyond the included count is billable — confirm the added cost first, then allow.
  if (e.meteredSeats && usedSeats >= e.includedMembers && !confirmed) {
    return { kind: "confirm", addedMonthlyCents: e.additionalSeatPriceCents }
  }

  return { kind: "allow" }
}

/**
 * Recompute the org's billable seat quantity from its current member count and push it to Stripe.
 * Best-effort and self-guarding: a no-op when billing is unconfigured, there is no Stripe subscription,
 * or the plan does not meter seats. Callers invoke it after a membership change; failures are logged,
 * never thrown, so member management never depends on Stripe being reachable.
 */
export async function syncSeatsForOrg(organizationId: string): Promise<void> {
  try {
    const { stripeConfigFromEnv, syncSubscriptionSeatQuantity } = await import("./stripe-gateway")
    const config = stripeConfigFromEnv()
    if (!config) return
    const { db, member, eq, sql } = await import("@realtr/db")
    const { getSubscriptionByOrg } = await import("@realtr/db/billing")
    const sub = await getSubscriptionByOrg(db, organizationId)
    if (!sub?.stripeSubscriptionId) return
    const plan = getPlan(sub.planId)
    if (!plan || plan.additionalSeatPriceCents <= 0) return // Solo / non-metered: nothing to sync

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(member)
      .where(eq(member.organizationId, organizationId))
    const memberCount = row?.count ?? 0
    const quantity = Math.max(0, memberCount - plan.includedMembers)

    await syncSubscriptionSeatQuantity(config, {
      subscriptionId: sub.stripeSubscriptionId,
      seatPriceId: config.prices.teamSeat,
      quantity,
    })
  } catch (error) {
    console.error("syncSeatsForOrg failed", { organizationId, error })
  }
}
