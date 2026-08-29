import Stripe from "stripe"
import {
  type BillingGateway,
  type CreateCheckoutInput,
  type EnsureCustomerInput,
  type StripePriceConfig,
  checkoutLineItems,
} from "./gateway"
import type { BillingWebhookEvent, SubscriptionSnapshot } from "./webhook"

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

/** The Stripe webhook signing secret, or null when webhooks are not configured (dev without Stripe). */
export function stripeWebhookSecretFromEnv(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null
}

/** Payment-failure grace window (days). Configurable; defaults to ADR 0008's 7. */
export function graceDaysFromEnv(): number {
  const raw = Number(process.env.BILLING_GRACE_DAYS)
  return Number.isFinite(raw) && raw > 0 ? raw : 7
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

// --- Webhook adapter (M6-A3): the Stripe side of the pure convergence in webhook.ts ---

/** Pull a Stripe id off a field that Stripe returns as either the id string or the expanded object. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

/**
 * Derive the subscription + customer this event concerns. Covers the events A3 acts on: the
 * subscription lifecycle, Checkout completion, and invoice payment success/failure (the dunning
 * signals). Other event types resolve to no subscription and are recorded-and-skipped by the converger.
 */
function eventTargets(event: Stripe.Event): {
  subscriptionId: string | null
  customerId: string | null
} {
  const object = event.data.object as unknown as Record<string, unknown>
  const customerId = idOf(object.customer as string | { id: string } | null | undefined)
  if (event.type.startsWith("customer.subscription.")) {
    return { subscriptionId: (object.id as string) ?? null, customerId }
  }
  // checkout.session.completed and invoice.* carry the subscription as a reference field.
  const subscriptionId = idOf(object.subscription as string | { id: string } | null | undefined)
  return { subscriptionId, customerId }
}

/**
 * The Stripe half of webhook handling: verify the signature and re-fetch the subscription's current
 * truth. Constructed from the same StripeConfig (needs `prices` to identify the seat line item) plus
 * the webhook signing secret. Isolated here so the SDK stays in one file.
 */
export function createStripeWebhookAdapter(config: StripeConfig, webhookSecret: string) {
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION })
  return {
    /** Verify the signature and normalize the event, or null when the signature is invalid. */
    verify(rawBody: string, signature: string): BillingWebhookEvent | null {
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
      } catch {
        return null
      }
      const { subscriptionId, customerId } = eventTargets(event)
      return { id: event.id, type: event.type, subscriptionId, customerId }
    },

    /** Re-fetch the subscription and normalize it to a provider-agnostic snapshot. */
    async fetchSubscription(subscriptionId: string): Promise<SubscriptionSnapshot | null> {
      let sub: Stripe.Subscription
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId)
      } catch {
        return null
      }
      // Seat quantity is the licensed quantity on the additional-seat price line (0 for Solo / no overage).
      const seatItem = sub.items.data.find((item) => item.price.id === config.prices.teamSeat)
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
      return {
        subscriptionId: sub.id,
        customerId: idOf(sub.customer) ?? "",
        organizationId: sub.metadata?.organizationId ?? null,
        planId: sub.metadata?.planId ?? null,
        status: sub.status,
        currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        seatQuantity: seatItem?.quantity ?? 0,
      }
    },
  }
}
