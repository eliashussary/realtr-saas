import type { ListingSource, ListingSyncRepository } from "@realtr/core"
import { describe, expect, it, vi } from "vitest"
import { type ListingsSyncDependencies, handleListingsSync } from "./listings-sync"

const payload = { version: 1 as const, organizationId: "org-alpha", provider: "fixture" }

function source(sync: ListingSource["sync"]): ListingSource {
  return { provider: "fixture", verify: async () => {}, sync, listEntitlement: async () => [] }
}

const repository: ListingSyncRepository = {
  getCheckpoint: async () => undefined,
  upsertListings: async (_o, _p, listings) => listings.length,
  markRemovedNotIn: async () => 0,
  recordRun: async () => {},
}

function deps(over: Partial<ListingsSyncDependencies>): ListingsSyncDependencies {
  return {
    getSource: () => source(async () => ({ upserts: [] })),
    loadConfig: async () => ({ clientId: "x", clientSecret: "y" }),
    loadServiceAreaBbox: async () => null,
    repository,
    log: vi.fn(),
    ...over,
  }
}

describe("listings.sync", () => {
  it("rejects malformed and unsupported payload versions", async () => {
    const getSource = vi.fn()
    await expect(handleListingsSync({}, deps({ getSource }))).rejects.toThrow()
    await expect(
      handleListingsSync({ ...payload, version: 2 }, deps({ getSource })),
    ).rejects.toThrow()
    expect(getSource).not.toHaveBeenCalled()
  })

  it("fails unknown providers so pg-boss can retry the job", async () => {
    await expect(handleListingsSync(payload, deps({ getSource: () => undefined }))).rejects.toThrow(
      "Unknown listing source provider",
    )
  })

  it("fails when the organization has no connected integration", async () => {
    await expect(
      handleListingsSync(payload, deps({ loadConfig: async () => null })),
    ).rejects.toThrow("No connected fixture integration")
  })

  it("does not acknowledge provider failures as success", async () => {
    const failure = new Error("provider unavailable")
    await expect(
      handleListingsSync(
        payload,
        deps({ getSource: () => source(async () => Promise.reject(failure)) }),
      ),
    ).rejects.toBe(failure)
  })

  it("bounds the pull with the tenant's service area when set", async () => {
    let seenConfig: Record<string, unknown> | undefined
    await handleListingsSync(
      payload,
      deps({
        getSource: () =>
          source(async (ctx) => {
            seenConfig = ctx.config
            return { upserts: [] }
          }),
        loadServiceAreaBbox: async () => ({ minLng: -76, minLat: 45, maxLng: -75, maxLat: 46 }),
      }),
    )
    expect(seenConfig?.bbox).toEqual([-76, 45, -75, 46])
  })

  it("leaves config unchanged when no service area is set", async () => {
    let seenConfig: Record<string, unknown> | undefined
    await handleListingsSync(
      payload,
      deps({
        getSource: () =>
          source(async (ctx) => {
            seenConfig = ctx.config
            return { upserts: [] }
          }),
      }),
    )
    expect(seenConfig?.bbox).toBeUndefined()
  })

  it("syncs for the payload organization without logging configuration", async () => {
    const loadConfig = vi.fn(async () => ({ clientId: "x", clientSecret: "y" }))
    const log = vi.fn()
    await handleListingsSync(payload, deps({ loadConfig, log }))
    expect(loadConfig).toHaveBeenCalledWith("org-alpha", "fixture")
    const message = log.mock.calls.at(-1)?.[0] as string
    expect(message).toContain("org=org-alpha")
    expect(message).toContain("mode=incremental")
    expect(message).not.toContain("clientSecret")
  })
})
