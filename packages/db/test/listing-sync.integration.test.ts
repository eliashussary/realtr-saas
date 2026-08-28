import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { and, eq, listing, listingSyncRun, listingSyncState } from "../src/index"
import { createListingRepository } from "../src/listings"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

function normalized(key: string) {
  return { sourceListingId: `ID-${key}`, sourceKey: key, status: "active" as const, data: { key } }
}

describe("listing sync repository", () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
  })
  beforeEach(async () => cleanTestDatabase(database))
  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("upserts listings and advances the checkpoint via a recorded run", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""
    const repository = createListingRepository(database.db)

    const written = await repository.upsertListings(organizationId, "ddf", [
      normalized("A"),
      normalized("B"),
    ])
    expect(written).toBe(2)

    await repository.recordRun({
      organizationId,
      provider: "ddf",
      mode: "incremental",
      status: "succeeded",
      fetched: 2,
      upserted: 2,
      removed: 0,
      checkpoint: "2026-03-01T00:00:00.000Z",
      startedAt: "2026-03-01T00:00:00.000Z",
      finishedAt: "2026-03-01T00:00:05.000Z",
    })

    expect(await repository.getCheckpoint(organizationId, "ddf")).toBe("2026-03-01T00:00:00.000Z")
    const state = await database.db
      .select()
      .from(listingSyncState)
      .where(eq(listingSyncState.organizationId, organizationId))
    expect(state).toHaveLength(1)
    const runs = await database.db
      .select()
      .from(listingSyncRun)
      .where(eq(listingSyncRun.organizationId, organizationId))
    expect(runs[0]?.status).toBe("succeeded")
  })

  it("re-upserting the same identity updates in place (idempotent)", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""
    const repository = createListingRepository(database.db)

    await repository.upsertListings(organizationId, "ddf", [normalized("A")])
    await repository.upsertListings(organizationId, "ddf", [
      { ...normalized("A"), data: { key: "A", price: 999 } },
    ])

    const rows = await database.db
      .select()
      .from(listing)
      .where(eq(listing.organizationId, organizationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data).toMatchObject({ price: 999 })
  })

  it("marks listings absent from the master list as removed", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""
    const repository = createListingRepository(database.db)
    await repository.upsertListings(organizationId, "ddf", [
      normalized("A"),
      normalized("B"),
      normalized("C"),
    ])

    const removed = await repository.markRemovedNotIn(organizationId, "ddf", ["A", "C"])
    expect(removed).toBe(1)

    const removedRows = await database.db
      .select({ sourceKey: listing.sourceKey })
      .from(listing)
      .where(and(eq(listing.organizationId, organizationId), eq(listing.status, "removed")))
    expect(removedRows.map((r) => r.sourceKey)).toEqual(["B"])
  })

  it("scopes removal to one tenant", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const repository = createListingRepository(database.db)
    await repository.upsertListings(alpha?.ids.organizationId ?? "", "ddf", [normalized("A")])
    await repository.upsertListings(beta?.ids.organizationId ?? "", "ddf", [normalized("A")])

    // An empty master list for alpha removes all of alpha's; beta must be untouched.
    await repository.markRemovedNotIn(alpha?.ids.organizationId ?? "", "ddf", [])

    const [betaRow] = await database.db
      .select({ status: listing.status })
      .from(listing)
      .where(eq(listing.organizationId, beta?.ids.organizationId ?? ""))
    expect(betaRow?.status).toBe("active")
  })
})
