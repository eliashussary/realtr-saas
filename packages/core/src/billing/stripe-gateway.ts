import Stripe from "stripe"
import {
  type BillingGateway,
  type CreateCheckoutInput,
  type EnsureCustomerInput,
  type StripePriceConfig,
  checkoutLineItems,
} from "./gateway"

// Real Stripe adapter for the BillingGateway port (M6-A2). Isolated here so the SDK is imported in
// exactly one place; everything else depends on the interface. Never imported by tests.

// Pin the API version so Stripe changes don't silently alter behavior between deploys.
const STRIPE_API_VERSION = "2025-02-24.acacia"

export interface StripeConfig {
  secretKey: string
  prices: StripePriceConfig
}

/**
 * Read Stripe configuration from env, or null when billing is not configured (dev without keys).
 * Callers degrade gracefully to a "billing not configured" state instead of throwing.
 */
export function stripeConfigFromEnv(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const solo = process.env.STRIPE_PRICE_SOLO
  const team = process.env.STRIPE_PRICE_TEAM
  const teamSeat = process.env.STRIPE_PRICE_TEAM_SEAT
  if (!secretKey || !solo || !team || !teamSeat) return null
  return { secretKey, prices: { solo, team, teamSeat } }
}

/** Card-required trial length (days). Configurable; defaults to the ADR 0008 value. */
export function trialDaysFromEnv(): number {
  const raw = Number(process.env.BILLING_TRIAL_DAYS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 14
}

export function createStripeGateway(config: StripeConfig): BillingGateway {
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION })
  return {
    async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
      if (input.existingCustomerId) return input.existingCustomerId
      const customer = await stripe.customers.create({
        email: input.email ?? undefined,
        name: input.name ?? undefined,
        metadata: { organizationId: input.organizationId },
      })
      return customer.id
    },
    async createCheckoutSession(input: CreateCheckoutInput) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customerId,
        line_items: checkoutLineItems(input.planId, input.additionalSeats, config.prices),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        // Identifies the tenant on the resulting webhook, alongside subscription metadata.
        client_reference_id: input.organizationId,
        subscription_data: {
          metadata: { organizationId: input.organizationId, planId: input.planId },
          ...(input.trialDays && input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
        },
      })
      if (!session.url) throw new Error("Stripe did not return a Checkout URL")
      return { id: session.id, url: session.url }
    },
  }
}
