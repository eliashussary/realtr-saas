import type { PlanId } from "./plans"

// Billing provider port (M6-A2, ADR 0008). Server functions and the orchestrator depend on this
// interface, not the Stripe SDK, so checkout logic is testable offline with a fake gateway. The real
// Stripe adapter lives in stripe-gateway.ts.

/** Stripe price ids for the plan catalog, supplied from env. */
export interface StripePriceConfig {
  /** Solo base price (per month). */
  solo: string
  /** Team base price — covers the included seats. */
  team: string
  /** Team per-additional-seat price (licensed quantity). */
  teamSeat: string
}

export interface CheckoutLineItem {
  price: string
  quantity: number
}

/**
 * Stripe line items for a plan. Solo is a single base price. Team is the base price plus, when there
 * are members beyond the included count, a per-seat licensed item whose quantity is the overage.
 */
export function checkoutLineItems(
  planId: PlanId,
  additionalSeats: number,
  prices: StripePriceConfig,
): CheckoutLineItem[] {
  if (planId === "solo") return [{ price: prices.solo, quantity: 1 }]
  const items: CheckoutLineItem[] = [{ price: prices.team, quantity: 1 }]
  if (additionalSeats > 0) items.push({ price: prices.teamSeat, quantity: additionalSeats })
  return items
}

export interface EnsureCustomerInput {
  organizationId: string
  email?: string | null
  name?: string | null
  /** Reuse an already-provisioned Stripe customer instead of creating a new one. */
  existingCustomerId?: string | null
}

export interface CreateCheckoutInput {
  customerId: string
  planId: PlanId
  /** Team members beyond the included count (0 for Solo or a within-included Team). */
  additionalSeats: number
  successUrl: string
  cancelUrl: string
  /** Card-required trial length in days; omit for no trial. */
  trialDays?: number
  /** Carried onto the subscription so webhooks can map back to the tenant. */
  organizationId: string
}

export interface CheckoutSession {
  id: string
  url: string
}

export interface BillingGateway {
  /** Return the tenant's Stripe customer id, creating one if needed. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>
  /** Create a subscription-mode Checkout session and return its hosted URL. */
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>
}
