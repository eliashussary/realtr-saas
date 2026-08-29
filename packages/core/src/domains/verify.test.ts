import { describe, expect, it } from "vitest"
import { CHALLENGE_SUBDOMAIN, type DnsResolver, dnsInstructions, verifyDomain } from "./verify"

function resolver(over: Partial<DnsResolver> = {}): DnsResolver {
  return {
    resolveCname: async () => [],
    resolveTxt: async () => [],
    ...over,
  }
}

const base = {
  hostname: "www.example.com",
  verificationToken: "tok-123",
  expectedCnameTarget: "sites.realtr.app",
}

describe("verifyDomain", () => {
  it("passes when TXT ownership and CNAME pointing both match", async () => {
    const result = await verifyDomain({
      ...base,
      resolver: resolver({
        resolveTxt: async (host) =>
          host === `${CHALLENGE_SUBDOMAIN}.www.example.com` ? ["tok-123"] : [],
        resolveCname: async () => ["sites.realtr.app."], // trailing dot tolerated
      }),
    })
    expect(result).toMatchObject({ ok: true, ownership: true, pointing: true })
  })

  it("fails and explains when ownership is missing", async () => {
    const result = await verifyDomain({
      ...base,
      resolver: resolver({ resolveCname: async () => ["sites.realtr.app"] }),
    })
    expect(result.ok).toBe(false)
    expect(result.ownership).toBe(false)
    expect(result.pointing).toBe(true)
    expect(result.reason).toContain("ownership")
  })

  it("fails when pointing at the wrong target and tolerates resolver errors", async () => {
    const result = await verifyDomain({
      ...base,
      resolver: resolver({
        resolveTxt: async () => ["tok-123"],
        resolveCname: async () => {
          throw new Error("NXDOMAIN")
        },
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.pointing).toBe(false)
    expect(result.reason).toContain("pointing")
  })

  it("produces the DNS records the customer must create", () => {
    expect(dnsInstructions(base)).toEqual([
      { type: "TXT", name: "_realtr-challenge.www.example.com", value: "tok-123" },
      { type: "CNAME", name: "www.example.com", value: "sites.realtr.app" },
    ])
  })
})
