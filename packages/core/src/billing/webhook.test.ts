import { describe, expect, it } from "vitest"
import {
  type BillingWebhookDeps,
  type BillingWebhookEvent,
  type PreviousMirror,
  type SubscriptionMirrorWrite,
  type SubscriptionSnapshot,
  handleBillingWebhook,
  mapStripeStatus,
  nextGraceEndsAt,
} from "./webhook"

const NOW = new Date("2026-08-29T00:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

// In-memory billing world: an event ledger, a subscription mirror keyed by org, a customer→org map,
// and Stripe's "current truth" keyed by subscription id (what fetchSubscription re-reads).
class MemoryBilling {
  ledger = new Set<string>()
  recorded: Array<{ eventId: string; organizationId: string | null }> = []
  mirrors = new Map<string, SubscriptionMirrorWrite>()
  customers = new Map<string, string>() // stripeCustomerId -> organizationId
  truth = new Map<string, SubscriptionSnapshot>() // subscriptionId -> snapshot
  now = NOW

  deps(over: Partial<BillingWebhookDeps> = {}): BillingWebhookDeps {
    return {
      isDuplicate: async (id) => this.ledger.has(id),
      recordEvent: async ({ eventId, organizationId }) => {
        this.ledger.add(eventId)
        this.recorded.push({ eventId, organizationId })
      },
      fetchSubscription: async (id) => this.truth.get(id) ?? null,
      resolveOrgByCustomer: async (customerId) => this.customers.get(customerId) ?? null,
      loadMirror: async (org): Promise<PreviousMirror | null> => {
        const m = this.mirrors.get(org)
        return m ? { status: m.status, planId: m.planId, graceEndsAt: m.graceEndsAt } : null
      },
      writeMirror: async (state) => {
        this.mirrors.set(state.organizationId, state)
      },
      graceDays: 7,
      now: () => this.now,
      ...over,
    }
  }
}

function snapshot(over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    subscriptionId: "sub_1",
    customerId: "cus_1",
    organizationId: "org-1",
    planId: "solo",
    status: "active",
    currentPeriodEnd: new Date("2026-09-29T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    seatQuantity: 0,
    ...over,
  }
}

function event(over: Partial<BillingWebhookEvent> = {}): BillingWebhookEvent {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    ...over,
  }
}

describe("mapStripeStatus", () => {
  it("maps the lifecycle statuses, folding unpaid into past_due and unknown into none", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing")
    expect(mapStripeStatus("active")).toBe("active")
    expect(mapStripeStatus("past_due")).toBe("past_due")
    expect(mapStripeStatus("unpaid")).toBe("past_due")
    expect(mapStripeStatus("canceled")).toBe("canceled")
    expect(mapStripeStatus("incomplete")).toBe("none")
    expect(mapStripeStatus("paused")).toBe("none")
  })
})

describe("nextGraceEndsAt", () => {
  it("anchors the deadline on entering grace and clears it on leaving", () => {
    expect(nextGraceEndsAt("past_due", null, NOW, 7)).toEqual(new Date(NOW.getTime() + 7 * DAY))
    expect(
      nextGraceEndsAt("active", { status: "past_due", planId: "solo", graceEndsAt: NOW }, NOW, 7),
    ).toBeNull()
  })

  it("preserves an existing deadline across repeated grace events (no push-out)", () => {
    const original = new Date(NOW.getTime() + 7 * DAY)
    const later = new Date(NOW.getTime() + 2 * DAY)
    const previous: PreviousMirror = { status: "past_due", planId: "solo", graceEndsAt: original }
    expect(nextGraceEndsAt("past_due", previous, later, 7)).toEqual(original)
  })
})

describe("handleBillingWebhook", () => {
  it("converges the mirror to re-fetched truth (never the event payload)", async () => {
    const world = new MemoryBilling()
    world.truth.set("sub_1", snapshot({ status: "active", planId: "team", seatQuantity: 2 }))

    // An event *typed* as a payment failure, but Stripe's current truth is active: truth wins.
    const outcome = await handleBillingWebhook(
      event({ type: "invoice.payment_failed" }),
      world.deps(),
    )

    expect(outcome).toEqual({ applied: true, organizationId: "org-1", status: "active" })
    const mirror = world.mirrors.get("org-1")
    expect(mirror).toMatchObject({
      status: "active",
      planId: "team",
      seatQuantity: 2,
      graceEndsAt: null,
    })
    expect(world.ledger.has("evt_1")).toBe(true)
  })

  it("ignores a replayed event id without re-fetching or writing", async () => {
    const world = new MemoryBilling()
    world.ledger.add("evt_1")
    let fetched = 0
    const outcome = await handleBillingWebhook(
      event(),
      world.deps({
        fetchSubscription: async (id) => {
          fetched++
          return world.truth.get(id) ?? null
        },
      }),
    )
    expect(outcome).toEqual({ applied: false, reason: "duplicate" })
    expect(fetched).toBe(0)
    expect(world.mirrors.size).toBe(0)
  })

  it("out-of-order delivery cannot regress state (every event reads current truth)", async () => {
    const world = new MemoryBilling()
    // Stripe's truth is already 'active' (the later real state).
    world.truth.set("sub_1", snapshot({ status: "active" }))
    // A stale 'created' (trialing) event arrives *after* the truth moved on.
    await handleBillingWebhook(
      event({ id: "evt_stale", type: "customer.subscription.created" }),
      world.deps(),
    )
    expect(world.mirrors.get("org-1")?.status).toBe("active")
  })

  it("sets a grace deadline on past_due and preserves it across retries, clearing on recovery", async () => {
    const world = new MemoryBilling()

    // First failure → grace anchored at now + 7d.
    world.truth.set("sub_1", snapshot({ status: "past_due" }))
    await handleBillingWebhook(event({ id: "evt_a" }), world.deps())
    const firstDeadline = world.mirrors.get("org-1")?.graceEndsAt
    expect(firstDeadline).toEqual(new Date(NOW.getTime() + 7 * DAY))

    // A retry two days later, still past_due → same deadline (not pushed out).
    world.now = new Date(NOW.getTime() + 2 * DAY)
    await handleBillingWebhook(event({ id: "evt_b" }), world.deps())
    expect(world.mirrors.get("org-1")?.graceEndsAt).toEqual(firstDeadline)

    // Payment recovers → active, deadline cleared.
    world.truth.set("sub_1", snapshot({ status: "active" }))
    await handleBillingWebhook(event({ id: "evt_c" }), world.deps())
    expect(world.mirrors.get("org-1")).toMatchObject({ status: "active", graceEndsAt: null })
  })

  it("resolves the org via customer lookup when subscription metadata lacks it", async () => {
    const world = new MemoryBilling()
    world.customers.set("cus_1", "org-1")
    world.truth.set("sub_1", snapshot({ organizationId: null }))
    const outcome = await handleBillingWebhook(event(), world.deps())
    expect(outcome).toEqual({ applied: true, organizationId: "org-1", status: "active" })
  })

  it("records but does not write when the org cannot be resolved", async () => {
    const world = new MemoryBilling()
    world.truth.set("sub_1", snapshot({ organizationId: null }))
    const outcome = await handleBillingWebhook(event(), world.deps())
    expect(outcome).toEqual({ applied: false, reason: "no_org" })
    expect(world.mirrors.size).toBe(0)
    expect(world.recorded).toEqual([{ eventId: "evt_1", organizationId: null }])
  })

  it("records but does not write for an event with no subscription", async () => {
    const world = new MemoryBilling()
    const outcome = await handleBillingWebhook(
      event({ type: "customer.updated", subscriptionId: null }),
      world.deps(),
    )
    expect(outcome).toEqual({ applied: false, reason: "no_subscription" })
    expect(world.ledger.has("evt_1")).toBe(true)
  })

  it("records but does not write when Stripe cannot find the subscription", async () => {
    const world = new MemoryBilling()
    const outcome = await handleBillingWebhook(event(), world.deps())
    expect(outcome).toEqual({ applied: false, reason: "not_found" })
    expect(world.mirrors.size).toBe(0)
  })
})
