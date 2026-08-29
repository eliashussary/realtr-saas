import { describe, expect, it, vi } from "vitest"
import { startCheckout } from "./checkout"
import {
  type BillingGateway,
  type CreateCheckoutInput,
  type EnsureCustomerInput,
  type StripePriceConfig,
  checkoutLineItems,
} from "./gateway"

const prices: StripePriceConfig = {
  solo: "price_solo",
  team: "price_team",
  teamSeat: "price_team_seat",
}

describe("checkoutLineItems", () => {
  it("uses a single base price for Solo", () => {
    expect(checkoutLineItems("solo", 0, prices)).toEqual([{ price: "price_solo", quantity: 1 }])
  })

  it("uses the Team base price with no seat item when within the included count", () => {
    expect(checkoutLineItems("team", 0, prices)).toEqual([{ price: "price_team", quantity: 1 }])
  })

  it("adds a per-seat licensed item for Team overage", () => {
    expect(checkoutLineItems("team", 3, prices)).toEqual([
      { price: "price_team", quantity: 1 },
      { price: "price_team_seat", quantity: 3 },
    ])
  })
})

function fakeGateway(overrides: Partial<BillingGateway> = {}): BillingGateway {
  return {
    ensureCustomer: vi.fn(async (i: EnsureCustomerInput) => i.existingCustomerId ?? "cus_new"),
    createCheckoutSession: vi.fn(async (i: CreateCheckoutInput) => ({
      id: "cs_1",
      url: `https://checkout.stripe.test/${i.planId}`,
    })),
    ...overrides,
  }
}

describe("startCheckout", () => {
  it("creates a customer when none exists and returns the session URL", async () => {
    const gateway = fakeGateway()
    const result = await startCheckout(gateway, {
      organizationId: "org_1",
      planId: "solo",
      additionalSeats: 0,
      email: "a@b.co",
      name: "Agent A",
      existingCustomerId: null,
      successUrl: "https://app/ok",
      cancelUrl: "https://app/cancel",
      trialDays: 14,
    })
    expect(result.customerId).toBe("cus_new")
    expect(result.session.url).toBe("https://checkout.stripe.test/solo")
    expect(gateway.ensureCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", existingCustomerId: null }),
    )
    expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_new", planId: "solo", organizationId: "org_1" }),
    )
  })

  it("reuses an existing Stripe customer instead of creating a new one", async () => {
    const gateway = fakeGateway()
    const result = await startCheckout(gateway, {
      organizationId: "org_2",
      planId: "team",
      additionalSeats: 2,
      existingCustomerId: "cus_existing",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/cancel",
    })
    expect(result.customerId).toBe("cus_existing")
    expect(gateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_existing", planId: "team", additionalSeats: 2 }),
    )
  })
})
