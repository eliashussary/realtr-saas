import type { ListingSource } from "@realtr/core"
import { describe, expect, it, vi } from "vitest"
import { handleListingsSync } from "./listings-sync"

const payload = { version: 1 as const, organizationId: "org-alpha", provider: "fixture" }
function source(sync: ListingSource["sync"]): ListingSource {
  return {
    provider: "fixture",
    verify: async () => {},
    sync,
    listEntitlement: async () => [],
  }
}

describe("listings.sync", () => {
  it("rejects malformed and unsupported payload versions", async () => {
    const getSource = vi.fn()
    await expect(handleListingsSync({}, { getSource, log: vi.fn() })).rejects.toThrow()
    await expect(
      handleListingsSync({ ...payload, version: 2 }, { getSource, log: vi.fn() }),
    ).rejects.toThrow()
    expect(getSource).not.toHaveBeenCalled()
  })

  it("fails unknown providers so pg-boss can retry the job", async () => {
    await expect(
      handleListingsSync(payload, { getSource: () => undefined, log: vi.fn() }),
    ).rejects.toThrow("Unknown listing source provider")
  })

  it("does not acknowledge provider failures as success", async () => {
    const failure = new Error("provider unavailable")
    await expect(
      handleListingsSync(payload, {
        getSource: () => source(async () => Promise.reject(failure)),
        log: vi.fn(),
      }),
    ).rejects.toBe(failure)
  })

  it("syncs for the payload organization without logging configuration", async () => {
    const sync = vi.fn(async () => ({ upserts: [] }))
    const log = vi.fn()
    await handleListingsSync(payload, { getSource: () => source(sync), log })
    expect(sync).toHaveBeenCalledWith({ config: {}, organizationId: "org-alpha" })
    expect(log).toHaveBeenCalledWith(expect.stringContaining("org=org-alpha"))
  })
})
