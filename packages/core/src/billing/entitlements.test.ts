import { describe, expect, it } from "vitest"
import { resolveEntitlements } from "./entitlements"
import { billableSeats, getPlan } from "./plans"

describe("resolveEntitlements", () => {
  it("treats a missing subscription as permissive (pre-billing tenants keep working)", () => {
    const e = resolveEntitlements(null)
    expect(e.status).toBe("none")
    expect(e.inGoodStanding).toBe(true)
    expect(e.canPublish).toBe(true)
    expect(e.canCaptureLeads).toBe(true)
    expect(e.canManageIntegrations).toBe(true)
  })

  it("grants full Solo capabilities when active", () => {
    const e = resolveEntitlements({ planId: "solo", status: "active" })
    expect(e.inGoodStanding).toBe(true)
    expect(e.canEditSite).toBe(true)
    expect(e.canPublish).toBe(true)
    expect(e.customDomains).toBe(1)
    expect(e.includedMembers).toBe(1)
    expect(e.memberCap).toBe(1)
    expect(e.meteredSeats).toBe(false)
  })

  it("treats trialing like active (card-required trial has full access)", () => {
    const e = resolveEntitlements({ planId: "team", status: "trialing" })
    expect(e.inGoodStanding).toBe(true)
    expect(e.canPublish).toBe(true)
  })

  it("exposes Team as uncapped with metered seats", () => {
    const e = resolveEntitlements({ planId: "team", status: "active" })
    expect(e.includedMembers).toBe(5)
    expect(e.memberCap).toBeNull()
    expect(e.meteredSeats).toBe(true)
  })

  it("makes past_due read-only with leads off but keeps the plan shape", () => {
    const e = resolveEntitlements({ planId: "solo", status: "past_due" })
    expect(e.inGoodStanding).toBe(false)
    expect(e.canEditSite).toBe(false)
    expect(e.canPublish).toBe(false)
    expect(e.canCaptureLeads).toBe(false)
    expect(e.canManageIntegrations).toBe(false)
    // Can't attach a new domain while not in good standing.
    expect(e.customDomains).toBe(0)
  })

  it("locks everything on lapsed and canceled", () => {
    for (const status of ["lapsed", "canceled"] as const) {
      const e = resolveEntitlements({ planId: "team", status })
      expect(e.inGoodStanding).toBe(false)
      expect(e.canPublish).toBe(false)
      expect(e.canCaptureLeads).toBe(false)
      expect(e.customDomains).toBe(0)
    }
  })

  it("falls back to permissive defaults for an unknown plan but preserves status", () => {
    const e = resolveEntitlements({ planId: "enterprise-typo", status: "active" })
    expect(e.status).toBe("active")
    expect(e.canPublish).toBe(true)
  })
})

describe("billableSeats", () => {
  it("bills nothing for Solo (no additional seats sold)", () => {
    const solo = getPlan("solo")
    if (!solo) throw new Error("solo plan missing")
    expect(billableSeats(solo, 1)).toBe(0)
    expect(billableSeats(solo, 5)).toBe(0)
  })

  it("bills Team members beyond the included 5", () => {
    const team = getPlan("team")
    if (!team) throw new Error("team plan missing")
    expect(billableSeats(team, 3)).toBe(0)
    expect(billableSeats(team, 5)).toBe(0)
    expect(billableSeats(team, 8)).toBe(3)
  })
})
