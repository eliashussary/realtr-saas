import { describe, expect, it } from "vitest"
import {
  DomainTransitionError,
  afterVerification,
  assertTransition,
  canTransition,
  isCertEligible,
  isDomainState,
  isServable,
} from "./state-machine"

describe("domain state machine", () => {
  it("allows the happy-path transitions", () => {
    expect(canTransition("pending", "verifying")).toBe(true)
    expect(canTransition("verifying", "verified")).toBe(true)
    expect(canTransition("verified", "active")).toBe(true)
    expect(canTransition("active", "detached")).toBe(true)
  })

  it("rejects illegal transitions and from a terminal state", () => {
    expect(canTransition("pending", "active")).toBe(false)
    expect(canTransition("verified", "pending")).toBe(false)
    expect(canTransition("detached", "verifying")).toBe(false)
    expect(() => assertTransition("pending", "active")).toThrow(DomainTransitionError)
  })

  it("allows retry from error and re-check from verified/active", () => {
    expect(canTransition("error", "verifying")).toBe(true)
    expect(canTransition("verified", "verifying")).toBe(true)
    expect(canTransition("active", "verified")).toBe(true)
  })

  it("serves only active; issues certs only when verified or active", () => {
    expect(isServable("active")).toBe(true)
    expect(isServable("verified")).toBe(false)
    expect(isCertEligible("verified")).toBe(true)
    expect(isCertEligible("active")).toBe(true)
    expect(isCertEligible("pending")).toBe(false)
  })

  it("computes the next state after a verification attempt", () => {
    expect(afterVerification("verifying", true)).toBe("verified")
    expect(afterVerification("active", true)).toBe("active")
    expect(afterVerification("verifying", false)).toBe("error")
  })

  it("validates raw status strings", () => {
    expect(isDomainState("verified")).toBe(true)
    expect(isDomainState("bogus")).toBe(false)
  })
})
