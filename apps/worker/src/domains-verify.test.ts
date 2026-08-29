import { describe, expect, it, vi } from "vitest"
import { handleDomainsVerify } from "./domains-verify"

describe("domains.verify", () => {
  it("verifies the payload domain and logs the resulting state", async () => {
    const verify = vi.fn(async () => ({ state: "verified" }))
    const log = vi.fn()
    await handleDomainsVerify({ version: 1, domainId: "d1" }, { verify, log })
    expect(verify).toHaveBeenCalledWith("d1")
    expect(log).toHaveBeenCalledWith(expect.stringContaining("domain=d1"))
    expect(log).toHaveBeenCalledWith(expect.stringContaining("state=verified"))
  })

  it("rejects malformed payloads", async () => {
    await expect(
      handleDomainsVerify({ version: 2, domainId: "d1" }, { verify: vi.fn(), log: vi.fn() }),
    ).rejects.toThrow()
  })

  it("propagates verification errors so pg-boss can retry", async () => {
    const verify = vi.fn(async () => Promise.reject(new Error("db down")))
    await expect(
      handleDomainsVerify({ version: 1, domainId: "d1" }, { verify, log: vi.fn() }),
    ).rejects.toThrow("db down")
  })
})
