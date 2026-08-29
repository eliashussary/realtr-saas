import { describe, expect, it } from "vitest"
import { UNMANAGED, resolveEntitlements } from "./entitlements"
import { evaluateInvite } from "./seats"

const solo = resolveEntitlements({ planId: "solo", status: "active" })
const team = resolveEntitlements({ planId: "team", status: "active" })
const teamPastDue = resolveEntitlements({ planId: "team", status: "past_due" })

describe("evaluateInvite", () => {
  it("allows pre-billing (UNMANAGED) tenants without limits", () => {
    expect(evaluateInvite({ entitlements: UNMANAGED, usedSeats: 99, confirmed: false })).toEqual({
      kind: "allow",
    })
  })

  it("blocks a not-in-good-standing subscription", () => {
    expect(evaluateInvite({ entitlements: teamPastDue, usedSeats: 1, confirmed: false })).toEqual({
      kind: "block",
      code: "payment_required",
    })
  })

  it("hard-caps Solo at one member", () => {
    expect(evaluateInvite({ entitlements: solo, usedSeats: 1, confirmed: false })).toEqual({
      kind: "block",
      code: "seat_limit",
    })
  })

  it("allows Team within the included seats", () => {
    expect(evaluateInvite({ entitlements: team, usedSeats: 4, confirmed: false })).toEqual({
      kind: "allow",
    })
  })

  it("asks Team to confirm the charge when inviting beyond the included seats", () => {
    expect(evaluateInvite({ entitlements: team, usedSeats: 5, confirmed: false })).toEqual({
      kind: "confirm",
      addedMonthlyCents: team.additionalSeatPriceCents,
    })
  })

  it("allows the billable Team seat once confirmed", () => {
    expect(evaluateInvite({ entitlements: team, usedSeats: 6, confirmed: true })).toEqual({
      kind: "allow",
    })
  })
})
