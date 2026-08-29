import { describe, expect, it } from "vitest"
import {
  DomainNotFoundError,
  type DomainRecord,
  type DomainRepository,
  runDomainVerification,
} from "./service"
import type { DnsResolver } from "./verify"

class MemoryDomains implements DomainRepository {
  constructor(private domain: DomainRecord | null) {}
  transitions: string[] = []
  async getDomain(id: string) {
    return this.domain && this.domain.id === id ? this.domain : null
  }
  async setStatus(_id: string, status: string) {
    this.transitions.push(status)
    if (this.domain) this.domain.status = status
  }
}

function resolver(over: Partial<DnsResolver> = {}): DnsResolver {
  return { resolveCname: async () => [], resolveTxt: async () => [], ...over }
}

const passing = resolver({
  resolveTxt: async (h) => (h.startsWith("_realtr-challenge.") ? ["tok"] : []),
  resolveCname: async () => ["sites.realtr.app"],
})

function domain(over: Partial<DomainRecord> = {}): DomainRecord {
  return {
    id: "d1",
    hostname: "www.example.com",
    status: "pending",
    verificationToken: "tok",
    ...over,
  }
}

const opts = { domainId: "d1", expectedCnameTarget: "sites.realtr.app" }

describe("runDomainVerification", () => {
  it("moves pending -> verifying -> verified on success", async () => {
    const repo = new MemoryDomains(domain())
    const outcome = await runDomainVerification({ ...opts, resolver: passing, repository: repo })
    expect(outcome).toMatchObject({ ok: true, state: "verified" })
    expect(repo.transitions).toEqual(["verifying", "verified"])
  })

  it("lands on error when the DNS check fails", async () => {
    const repo = new MemoryDomains(domain())
    const outcome = await runDomainVerification({ ...opts, resolver: resolver(), repository: repo })
    expect(outcome.ok).toBe(false)
    expect(outcome.state).toBe("error")
    expect(repo.transitions.at(-1)).toBe("error")
  })

  it("keeps an active domain active on a successful re-check (no verifying hop)", async () => {
    const repo = new MemoryDomains(domain({ status: "active" }))
    const outcome = await runDomainVerification({ ...opts, resolver: passing, repository: repo })
    expect(outcome.state).toBe("active")
    expect(repo.transitions).toEqual(["active"]) // active -> verifying is not allowed, so skipped
  })

  it("never re-verifies a detached domain", async () => {
    const repo = new MemoryDomains(domain({ status: "detached" }))
    const outcome = await runDomainVerification({ ...opts, resolver: passing, repository: repo })
    expect(outcome.state).toBe("detached")
    expect(repo.transitions).toEqual([])
  })

  it("throws when the domain is missing", async () => {
    const repo = new MemoryDomains(null)
    await expect(
      runDomainVerification({ ...opts, resolver: passing, repository: repo }),
    ).rejects.toBeInstanceOf(DomainNotFoundError)
  })
})
