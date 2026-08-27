import { describe, expect, it } from "vitest"
import { assertDomainCanBeRegistered, parseDomainInput } from "./domain-input"

const siteId = "00000000-0000-4000-8000-000000000001"

describe("domain input", () => {
  it("normalizes a valid DNS hostname", () => {
    expect(parseDomainInput({ siteId, hostname: "  WWW.Example.COM  " })).toEqual({
      siteId,
      hostname: "www.example.com",
    })
  })

  it.each([
    "https://example.com",
    "example.com/path",
    "example.com:443",
    "*.example.com",
    "127.0.0.1",
    "localhost",
    "-bad.example",
    "bad-.example",
    "two..dots.example",
  ])("rejects invalid host form %s", (hostname) => {
    expect(() => parseDomainInput({ siteId, hostname })).toThrow()
  })

  it("reserves platform hosts and production localhost names", () => {
    expect(() => assertDomainCanBeRegistered("sites.realtr.app", "sites.realtr.app", true)).toThrow(
      "Domain unavailable",
    )
    expect(() =>
      assertDomainCanBeRegistered("agent.sites.realtr.app", "sites.realtr.app", true),
    ).toThrow("Domain unavailable")
    expect(() => assertDomainCanBeRegistered("demo.localhost", "sites.realtr.app", true)).toThrow(
      "Domain unavailable",
    )
    expect(() =>
      assertDomainCanBeRegistered("demo.localhost", "sites.realtr.app", false),
    ).not.toThrow()
  })
})
