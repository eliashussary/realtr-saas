import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// Billing: subscription status + Stripe Checkout start (M6-A2). @realtr/db / @realtr/core imports stay
// dynamic and inside handlers (server-only pg + Stripe SDK) — same convention as crm.ts / listings.ts.

const planInput = z.object({ planId: z.enum(["solo", "team"]) })

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

function appUrl(): string {
  return process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3001"
}

/** Current subscription status + the plan catalog for the billing page. */
export const getBillingStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }

  const { PLANS, stripeConfigFromEnv } = await import("@realtr/core")
  const { db } = await import("@realtr/db")
  const { getSubscriptionByOrg } = await import("@realtr/db/billing")

  const sub = await getSubscriptionByOrg(db, authorization.organizationId)
  const plans = Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    basePriceCents: p.basePriceCents,
    includedMembers: p.includedMembers,
    additionalSeatPriceCents: p.additionalSeatPriceCents,
  }))

  return {
    ok: true as const,
    configured: stripeConfigFromEnv() !== null,
    canManage: can(authorization.role, "billing", "manage"),
    status: sub?.status ?? "none",
    planId: sub?.planId ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    // ISO string (Dates don't survive server-fn serialization); null unless in the grace window.
    graceEndsAt: sub?.graceEndsAt?.toISOString() ?? null,
    plans,
  }
})

/** Start a Stripe Checkout session for a plan; returns the hosted URL to redirect to. */
export const startCheckoutFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => planInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "billing", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }

    const { PLANS, startCheckout, createStripeGateway, stripeConfigFromEnv, trialDaysFromEnv } =
      await import("@realtr/core")
    const config = stripeConfigFromEnv()
    if (!config) return { ok: false as const, code: "not_configured" as const }

    const { db, eq, count, member, user } = await import("@realtr/db")
    const { getSubscriptionByOrg, saveStripeCustomerId } = await import("@realtr/db/billing")

    // Buyer identity for the Stripe customer.
    const [buyer] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, authorization.userId))
      .limit(1)

    // Additional seats = members beyond the plan's included count (0 for Solo).
    const plan = PLANS[data.planId]
    const [{ value: memberCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, authorization.organizationId))
    const additionalSeats =
      plan.additionalSeatPriceCents > 0 ? Math.max(0, memberCount - plan.includedMembers) : 0

    const existing = await getSubscriptionByOrg(db, authorization.organizationId)
    const gateway = createStripeGateway(config)

    try {
      const { customerId, session } = await startCheckout(gateway, {
        organizationId: authorization.organizationId,
        planId: data.planId,
        additionalSeats,
        email: buyer?.email,
        name: buyer?.name,
        existingCustomerId: existing?.stripeCustomerId,
        successUrl: `${appUrl()}/billing?checkout=success`,
        cancelUrl: `${appUrl()}/billing?checkout=cancelled`,
        trialDays: trialDaysFromEnv(),
      })
      await saveStripeCustomerId(db, authorization.organizationId, customerId)
      return { ok: true as const, url: session.url }
    } catch (error) {
      // Never leak Stripe internals to the client.
      console.error("startCheckout failed", error)
      return { ok: false as const, code: "checkout_failed" as const }
    }
  })

/**
 * Open the Stripe Customer Portal — where the tenant updates a failed card (the way out of grace),
 * changes plan, or cancels. Owner/admin only; requires a provisioned Stripe customer (i.e. they have
 * been through checkout at least once).
 */
export const openBillingPortalFn = createServerFn({ method: "POST" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  if (!can(authorization.role, "billing", "manage")) {
    return { ok: false as const, code: "forbidden" as const }
  }

  const { createBillingPortalSession, stripeConfigFromEnv } = await import("@realtr/core")
  const config = stripeConfigFromEnv()
  if (!config) return { ok: false as const, code: "not_configured" as const }

  const { db } = await import("@realtr/db")
  const { getSubscriptionByOrg } = await import("@realtr/db/billing")
  const sub = await getSubscriptionByOrg(db, authorization.organizationId)
  if (!sub?.stripeCustomerId) return { ok: false as const, code: "no_customer" as const }

  try {
    const { url } = await createBillingPortalSession(config, {
      customerId: sub.stripeCustomerId,
      returnUrl: `${appUrl()}/billing`,
    })
    return { ok: true as const, url }
  } catch (error) {
    console.error("openBillingPortal failed", error)
    return { ok: false as const, code: "portal_failed" as const }
  }
})
