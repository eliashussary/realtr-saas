import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { countListings, searchListings } from "../src/listings"
import { listing } from "../src/schema"
import { clearServiceArea, getServiceArea, upsertServiceArea } from "../src/service-areas"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

function pointData(lng: number, lat: number) {
  return { listPrice: 500000, propertyType: "House", latitude: lat, longitude: lng }
}

// A box around Ottawa. inFeed/inManual sit inside; outFeed/outManual sit far outside (Toronto-ish).
const OTTAWA_BOX = { minLng: -75.9, minLat: 45.2, maxLng: -75.5, maxLat: 45.5 }

describe("service-area constraint", () => {
  let database: TestDatabase
  let orgId: string

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
  })

  beforeEach(async () => {
    await cleanTestDatabase(database)
    const [alpha] = await createTwoTenantFixture(database)
    orgId = alpha?.ids.organizationId ?? ""
    await database.db.insert(listing).values([
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "inFeed",
        sourceKey: "K1",
        status: "active",
        data: pointData(-75.7, 45.4),
      },
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "outFeed",
        sourceKey: "K2",
        status: "active",
        data: pointData(-79.4, 43.7),
      },
      {
        organizationId: orgId,
        source: "manual",
        sourceListingId: "inManual",
        sourceKey: "K3",
        status: "active",
        data: pointData(-75.6, 45.3),
      },
      {
        organizationId: orgId,
        source: "manual",
        sourceListingId: "outManual",
        sourceKey: "K4",
        status: "active",
        data: pointData(-79.3, 43.65),
      },
    ])
  })

  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("stores, reads, and clears the service area (one row per org)", async () => {
    expect(await getServiceArea(database.db, orgId)).toBeNull()
    await upsertServiceArea(database.db, orgId, { ...OTTAWA_BOX, label: "Ottawa" })
    expect(await getServiceArea(database.db, orgId)).toMatchObject({
      ...OTTAWA_BOX,
      label: "Ottawa",
    })
    // upsert replaces in place
    await upsertServiceArea(database.db, orgId, { ...OTTAWA_BOX, maxLat: 45.6 })
    expect((await getServiceArea(database.db, orgId))?.maxLat).toBeCloseTo(45.6)
    expect(await clearServiceArea(database.db, orgId)).toBe(true)
    expect(await getServiceArea(database.db, orgId)).toBeNull()
  })

  it("with no service area, all active listings show", async () => {
    const rows = await searchListings(database.db, orgId, {})
    expect(new Set(rows.map((r) => r.sourceListingId))).toEqual(
      new Set(["inFeed", "outFeed", "inManual", "outManual"]),
    )
  })

  it("constrains feed listings to the box but always keeps manual listings", async () => {
    const rows = await searchListings(database.db, orgId, {}, { serviceArea: OTTAWA_BOX })
    // outFeed is dropped (feed, outside); both manual listings stay even though outManual is far away.
    expect(new Set(rows.map((r) => r.sourceListingId))).toEqual(
      new Set(["inFeed", "inManual", "outManual"]),
    )
    expect(await countListings(database.db, orgId, {}, { serviceArea: OTTAWA_BOX })).toBe(3)
  })
})
