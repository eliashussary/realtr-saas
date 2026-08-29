import type { SubscriptionStatus } from "@realtr/core"
import { createFileRoute } from "@tanstack/react-router"

// Stripe webhook endpoint (M6-A3, ADR 0008). The single place local subscription state is written.
// Reads the RAW request body (signature verification needs the exact bytes), verifies the signature,
// then hands a normalized event to the pure converger, which re-fetches Stripe's current truth and
// upserts the mirror. Idempotent (event-id ledger) and order-independent (always re-fetches).
export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripeConfigFromEnv, stripeWebhookSecretFromEnv, graceDaysFromEnv } = await import(
          "@realtr/core"
        )
        const config = stripeConfigFromEnv()
        const secret = stripeWebhookSecretFromEnv()
        // Not configured (dev without Stripe): nothing can legitimately call this. 503 keeps a real
        // Stripe delivery retrying rather than being silently acked as processed.
        if (!config || !secret) {
          return new Response("billing not configured", { status: 503 })
        }

        const signature = request.headers.get("stripe-signature")
        if (!signature) return new Response("missing signature", { status: 400 })
        const rawBody = await request.text()

        const { createStripeWebhookAdapter, handleBillingWebhook } = await import("@realtr/core")
        const adapter = createStripeWebhookAdapter(config, secret)
        const event = adapter.verify(rawBody, signature)
        if (!event) return new Response("invalid signature", { status: 400 })

        const { db } = await import("@realtr/db")
        const {
          hasBillingEvent,
          recordBillingEvent,
          findOrgByStripeCustomerId,
          getSubscriptionByOrg,
          writeSubscriptionMirror,
        } = await import("@realtr/db/billing")

        try {
          const outcome = await handleBillingWebhook(event, {
            graceDays: graceDaysFromEnv(),
            isDuplicate: (id) => hasBillingEvent(db, id),
            recordEvent: ({ eventId, type, organizationId }) =>
              recordBillingEvent(db, { stripeEventId: eventId, type, organizationId }),
            fetchSubscription: (id) => adapter.fetchSubscription(id),
            resolveOrgByCustomer: (customerId) => findOrgByStripeCustomerId(db, customerId),
            loadMirror: async (organizationId) => {
              const row = await getSubscriptionByOrg(db, organizationId)
              if (!row) return null
              return {
                status: row.status as SubscriptionStatus,
                planId: row.planId,
                graceEndsAt: row.graceEndsAt,
              }
            },
            writeMirror: (state) => writeSubscriptionMirror(db, state),
          })
          // Always 200 for a well-formed, verified event — including duplicates and events we don't
          // act on — so Stripe stops retrying. Only signature/transport failures are non-200.
          return new Response(JSON.stringify(outcome), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        } catch (error) {
          // Unexpected failure (DB down, Stripe fetch error): 500 so Stripe retries later.
          console.error("billing webhook failed", error)
          return new Response("webhook processing failed", { status: 500 })
        }
      },
    },
  },
})
