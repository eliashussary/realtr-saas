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

import { type DomainCertRepository, approveForCertificate } from "./service"

class MemoryCertDomains implements DomainCertRepository {
  constructor(private rows: Array<{ id: string; hostname: string; status: string }>) {}
  async findByHostname(hostname: string) {
    const row = this.rows.find((r) => r.hostname === hostname)
    return row ? { id: row.id, status: row.status } : null
  }
  async setStatus(id: string, status: string) {
    const row = this.rows.find((r) => r.id === id)
    if (row) row.status = status
  }
}

describe("approveForCertificate", () => {
  it("approves a verified domain and promotes it to active", async () => {
    const repo = new MemoryCertDomains([{ id: "d1", hostname: "www.x.com", status: "verified" }])
    expect(await approveForCertificate("www.x.com", repo)).toBe(true)
    expect(await repo.findByHostname("www.x.com")).toMatchObject({ status: "active" })
  })

  it("approves an already-active domain without changing it (idempotent)", async () => {
    const repo = new MemoryCertDomains([{ id: "d1", hostname: "www.x.com", status: "active" }])
    expect(await approveForCertificate("www.x.com", repo)).toBe(true)
    expect(await repo.findByHostname("www.x.com")).toMatchObject({ status: "active" })
  })

  it("denies pending/error/unknown domains and leaves their state", async () => {
    const repo = new MemoryCertDomains([
      { id: "d1", hostname: "pending.x.com", status: "pending" },
      { id: "d2", hostname: "error.x.com", status: "error" },
    ])
    expect(await approveForCertificate("pending.x.com", repo)).toBe(false)
    expect(await approveForCertificate("error.x.com", repo)).toBe(false)
    expect(await approveForCertificate("unknown.x.com", repo)).toBe(false)
    expect(await repo.findByHostname("pending.x.com")).toMatchObject({ status: "pending" })
  })
})
