import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getAreaPolygons, listAreaFacets, loadAreas } from "../src/areas"
import { searchListings } from "../src/listings"
import { area, listing } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

function pointData(lng: number, lat: number, over: Record<string, unknown> = {}) {
  return { listPrice: 500000, propertyType: "House", latitude: lat, longitude: lng, ...over }
}

// A square around part of Ottawa; a1/a3 fall inside, a2 outside.
const OTTAWA_SQUARE = {
  type: "Polygon",
  coordinates: [
    [
      [-75.75, 45.38],
      [-75.65, 45.38],
      [-75.65, 45.45],
      [-75.75, 45.45],
      [-75.75, 45.38],
    ],
  ],
}

describe("area (PostGIS) filtering", () => {
  let database: TestDatabase
  let orgId: string

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
  })

  beforeEach(async () => {
    await cleanTestDatabase(database)
    await database.db.delete(area) // area is global reference data, not covered by the tenant cleaner
    const [alpha] = await createTwoTenantFixture(database)
    orgId = alpha?.ids.organizationId ?? ""
    await loadAreas(database.db, [
      { id: "ottawa_test", name: "Test Ward", region: "ottawa", geometry: OTTAWA_SQUARE },
    ])
    await database.db.insert(listing).values([
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a1",
        sourceKey: "KA1",
        status: "active",
        data: pointData(-75.7, 45.4),
      },
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a3",
        sourceKey: "KA3",
        status: "active",
        data: pointData(-75.69, 45.42),
      },
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a2",
        sourceKey: "KA2",
        status: "active",
        data: pointData(-75.9, 45.3),
      },
      // inside the polygon but removed — must not count
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a4",
        sourceKey: "KA4",
        status: "removed",
        data: pointData(-75.7, 45.4),
      },
    ])
  })

  afterAll(async () => {
    if (!database) return
    await database.db.delete(area)
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("loads polygons and coerces Polygon → MultiPolygon", async () => {
    const polys = await getAreaPolygons(database.db, ["ottawa_test"])
    expect(polys).toHaveLength(1)
    expect(polys[0]?.name).toBe("Test Ward")
    expect(() => JSON.parse(polys[0]?.geojson ?? "")).not.toThrow()
    expect(JSON.parse(polys[0]?.geojson ?? "").type).toBe("MultiPolygon")
  })

  it("reports area facets from active listings inside the polygon", async () => {
    const facets = await listAreaFacets(database.db, orgId)
    expect(facets).toEqual([{ id: "ottawa_test", name: "Test Ward", region: "ottawa", count: 2 }])
  })

  it("filters listings to those inside the selected area", async () => {
    const rows = await searchListings(database.db, orgId, { areaIds: ["ottawa_test"] })
    expect(new Set(rows.map((r) => r.sourceListingId))).toEqual(new Set(["a1", "a3"]))
  })

  it("returns nothing for an area that contains no listings", async () => {
    await loadAreas(database.db, [
      {
        id: "empty_area",
        name: "Empty",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-70, 40],
              [-69.9, 40],
              [-69.9, 40.1],
              [-70, 40.1],
              [-70, 40],
            ],
          ],
        },
      },
    ])
    const rows = await searchListings(database.db, orgId, { areaIds: ["empty_area"] })
    expect(rows).toHaveLength(0)
  })
})
