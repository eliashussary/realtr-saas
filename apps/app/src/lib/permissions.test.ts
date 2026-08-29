import { describe, expect, it } from "vitest"
import { can } from "./permissions"

describe("RBAC can()", () => {
  it("owner and admin manage the site, integrations, members, and any listing", () => {
    for (const role of ["owner", "admin"]) {
      expect(can(role, "site", "publish")).toBe(true)
      expect(can(role, "integration", "manage")).toBe(true)
      expect(can(role, "member", "create")).toBe(true)
      expect(can(role, "listing", "feature")).toBe(true)
      expect(can(role, "listing", "manageAny")).toBe(true)
      expect(can(role, "agentProfile", "editAny")).toBe(true)
    }
  })

  it("only the owner can delete the organization", () => {
    expect(can("owner", "organization", "delete")).toBe(true)
    expect(can("admin", "organization", "delete")).toBe(false)
  })

  it("agents manage only their own profile and listings, nothing site-wide", () => {
    expect(can("agent", "listing", "create")).toBe(true)
    expect(can("agent", "listing", "manageOwn")).toBe(true)
    expect(can("agent", "agentProfile", "editOwn")).toBe(true)
    // Denied:
    expect(can("agent", "listing", "manageAny")).toBe(false)
    expect(can("agent", "listing", "feature")).toBe(false)
    expect(can("agent", "site", "publish")).toBe(false)
    expect(can("agent", "site", "edit")).toBe(false)
    expect(can("agent", "integration", "manage")).toBe(false)
    expect(can("agent", "member", "create")).toBe(false)
    expect(can("agent", "agentProfile", "editAny")).toBe(false)
  })

  it("an unknown role falls back to the least-privileged agent set", () => {
    expect(can("member", "site", "publish")).toBe(false)
    expect(can("member", "listing", "manageOwn")).toBe(true)
  })
})
