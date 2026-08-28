import { describe, expect, it, vi } from "vitest"
import type { ListingSource, NormalizedListing } from "./sources/types"
import { type ListingSyncRepository, type ListingSyncRunResult, runListingSync } from "./sync"

function listing(key: string): NormalizedListing {
  return { sourceListingId: `ID-${key}`, sourceKey: key, status: "active", data: {} }
}

/** In-memory repository standing in for the real (tenant-copy) persistence. */
class MemoryRepository implements ListingSyncRepository {
  rows = new Map<string, { sourceKey: string; status: "active" | "removed" }>()
  checkpoints = new Map<string, string>()
  runs: ListingSyncRunResult[] = []

  async getCheckpoint(org: string, provider: string) {
    return this.checkpoints.get(`${org}:${provider}`)
  }
  async upsertListings(_org: string, _provider: string, listings: NormalizedListing[]) {
    for (const l of listings)
      this.rows.set(l.sourceKey, { sourceKey: l.sourceKey, status: "active" })
    return listings.length
  }
  async markRemovedNotIn(_org: string, _provider: string, activeKeys: string[]) {
    const keep = new Set(activeKeys)
    let removed = 0
    for (const row of this.rows.values()) {
      if (row.status === "active" && !keep.has(row.sourceKey)) {
        row.status = "removed"
        removed++
      }
    }
    return removed
  }
  async recordRun(run: ListingSyncRunResult) {
    this.runs.push(run)
    if (run.status === "succeeded" && run.mode === "incremental" && run.checkpoint) {
      this.checkpoints.set(`${run.organizationId}:${run.provider}`, run.checkpoint)
    }
  }
}

function fakeSource(over: Partial<ListingSource> = {}): ListingSource {
  return {
    provider: "ddf",
    verify: async () => {},
    sync: async () => ({ upserts: [] }),
    listEntitlement: async () => [],
    ...over,
  }
}

const base = { organizationId: "org-1", provider: "ddf", config: {} }

describe("runListingSync incremental", () => {
  it("upserts and advances the checkpoint on success", async () => {
    const repository = new MemoryRepository()
    const source = fakeSource({
      sync: async () => ({
        upserts: [listing("A"), listing("B")],
        checkpoint: "2026-03-01T00:00:00.000Z",
      }),
    })
    const run = await runListingSync({ ...base, mode: "incremental", source, repository })

    expect(run.status).toBe("succeeded")
    expect(run.upserted).toBe(2)
    expect(await repository.getCheckpoint("org-1", "ddf")).toBe("2026-03-01T00:00:00.000Z")
  })

  it("passes an overlapped `since` derived from the stored checkpoint", async () => {
    const repository = new MemoryRepository()
    repository.checkpoints.set("org-1:ddf", "2026-03-01T00:10:00.000Z")
    const sync = vi.fn(async () => ({ upserts: [] }))
    await runListingSync({
      ...base,
      mode: "incremental",
      source: fakeSource({ sync }),
      repository,
      overlapMs: 60_000,
    })

    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ since: "2026-03-01T00:09:00.000Z" }),
    )
  })

  it("records a failed run without advancing the checkpoint, and rethrows", async () => {
    const repository = new MemoryRepository()
    repository.checkpoints.set("org-1:ddf", "2026-02-01T00:00:00.000Z")
    const source = fakeSource({ sync: async () => Promise.reject(new Error("upstream 503")) })

    await expect(
      runListingSync({ ...base, mode: "incremental", source, repository }),
    ).rejects.toThrow("upstream 503")
    expect(repository.runs.at(-1)?.status).toBe("failed")
    expect(await repository.getCheckpoint("org-1", "ddf")).toBe("2026-02-01T00:00:00.000Z")
  })
})

describe("runListingSync reconcile", () => {
  it("removes listings absent from the master list", async () => {
    const repository = new MemoryRepository()
    await repository.upsertListings("org-1", "ddf", [listing("A"), listing("B"), listing("C")])
    const source = fakeSource({ listEntitlement: async () => ["A", "C"] })

    const run = await runListingSync({ ...base, mode: "reconcile", source, repository })
    expect(run.removed).toBe(1)
    expect(repository.rows.get("B")?.status).toBe("removed")
    expect(repository.rows.get("A")?.status).toBe("active")
  })

  it("does not remove everything on an empty master list unless allowed", async () => {
    const repository = new MemoryRepository()
    await repository.upsertListings("org-1", "ddf", [listing("A")])
    const source = fakeSource({ listEntitlement: async () => [] })

    const skipped = await runListingSync({ ...base, mode: "reconcile", source, repository })
    expect(skipped.removed).toBe(0)
    expect(repository.rows.get("A")?.status).toBe("active")

    const allowed = await runListingSync({
      ...base,
      mode: "reconcile",
      source,
      repository,
      allowEmptyEntitlement: true,
    })
    expect(allowed.removed).toBe(1)
    expect(repository.rows.get("A")?.status).toBe("removed")
  })

  it("records a failed run and removes nothing when entitlement fetch fails", async () => {
    const repository = new MemoryRepository()
    await repository.upsertListings("org-1", "ddf", [listing("A")])
    const source = fakeSource({
      listEntitlement: async () => Promise.reject(new Error("token expired")),
    })

    await expect(
      runListingSync({ ...base, mode: "reconcile", source, repository }),
    ).rejects.toThrow("token expired")
    expect(repository.rows.get("A")?.status).toBe("active")
    expect(repository.runs.at(-1)?.status).toBe("failed")
  })
})
