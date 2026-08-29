import type { BillingGateway, CheckoutSession } from "./gateway"
import type { PlanId } from "./plans"

// Checkout orchestration (M6-A2). Pure of Stripe and the DB: it drives a BillingGateway, so it is
// unit-tested with a fake gateway. The server function supplies the real gateway and persists the
// returned customer id.

export interface StartCheckoutInput {
  organizationId: string
  planId: PlanId
  additionalSeats: number
  email?: string | null
  name?: string | null
  existingCustomerId?: string | null
  successUrl: string
  cancelUrl: string
  trialDays?: number
}

export interface StartCheckoutResult {
  /** The (possibly newly created) Stripe customer id — persist it against the org. */
  customerId: string
  session: CheckoutSession
}

export async function startCheckout(
  gateway: BillingGateway,
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  const customerId = await gateway.ensureCustomer({
    organizationId: input.organizationId,
    email: input.email,
    name: input.name,
    existingCustomerId: input.existingCustomerId,
  })
  const session = await gateway.createCheckoutSession({
    customerId,
    planId: input.planId,
    additionalSeats: input.additionalSeats,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    trialDays: input.trialDays,
    organizationId: input.organizationId,
  })
  return { customerId, session }
}
