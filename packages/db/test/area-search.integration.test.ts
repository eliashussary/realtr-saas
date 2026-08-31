import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  getAreaPolygons,
  getOrgAreaRanks,
  listAreaFacets,
  listCuratedAreas,
  listServiceAreaAreas,
  loadAreas,
  removeOrgAreas,
  setOrgAreas,
} from "../src/areas"
import { searchListings } from "../src/listings"
import { area, listing } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture, tenantFixtureIds } from "../src/test/fixtures"

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
      // A far-away empty polygon (no listings) — available to the curation tests that need a
      // curated-but-unstocked area.
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
    expect(facets).toEqual([
      { id: "ottawa_test", name: "Test Ward", region: "ottawa", parentRegion: null, count: 2 },
    ])
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

  // ── Tenant curation (org_area) ──────────────────────────────────────────────

  it("curation is empty -> falls back to in-stock areas (rank null)", async () => {
    const curated = await listCuratedAreas(database.db, orgId)
    expect(curated).toEqual([expect.objectContaining({ id: "ottawa_test", rank: null, count: 2 })])
  })

  it("setOrgAreas ranks curated areas and returns them rank-ordered with live counts", async () => {
    // Curate two areas; the second has 0 in-stock listings but still appears (curation narrows the
    // menu, not search), and order follows rank, not count.
    const n = await setOrgAreas(database.db, orgId, ["empty_area", "ottawa_test"])
    expect(n).toBe(2)
    const curated = await listCuratedAreas(database.db, orgId)
    expect(curated.map((c) => c.id)).toEqual(["empty_area", "ottawa_test"])
    expect(curated.map((c) => c.rank)).toEqual([0, 1])
    expect(curated[0]).toMatchObject({ id: "empty_area", count: 0 })
    expect(curated[1]).toMatchObject({ id: "ottawa_test", count: 2 })
  })

  it("curation is tenant-scoped: org A's set is invisible to org B (negative cross-tenant)", async () => {
    const betaOrgId = tenantFixtureIds.beta.organizationId
    // Give alpha a curation first, then confirm beta sees none of it.
    await setOrgAreas(database.db, orgId, ["ottawa_test"])
    // Beta has no listings and no curation -> empty fallback.
    const betaCurated = await listCuratedAreas(database.db, betaOrgId)
    expect(betaCurated).toEqual([])
    // And beta's rank map is empty, not alpha's.
    const betaRanks = await getOrgAreaRanks(database.db, betaOrgId)
    expect(betaRanks.size).toBe(0)
    // Alpha's is intact.
    const alphaRanks = await getOrgAreaRanks(database.db, orgId)
    expect([...alphaRanks.keys()]).toEqual(["ottawa_test"])
    // A bogus area id cannot be curated (FK to area) — setOrgAreas on an unknown id rejects.
    await expect(setOrgAreas(database.db, betaOrgId, ["no_such_area"])).rejects.toThrow()
  })

  it("removeOrgAreas clears specific areas from a tenant only", async () => {
    await setOrgAreas(database.db, orgId, ["empty_area", "ottawa_test"])
    await removeOrgAreas(database.db, orgId, ["empty_area"])
    const ranks = await getOrgAreaRanks(database.db, orgId)
    expect([...ranks.keys()]).toEqual(["ottawa_test"])
    const curated = await listCuratedAreas(database.db, orgId)
    expect(curated.map((c) => c.id)).toEqual(["ottawa_test"])
  })

  it("hierarchy columns round-trip (parentRegion + region) through the facet", async () => {
    await loadAreas(database.db, [
      {
        id: "gta_durham-region_oshawa_lakeview",
        name: "Lakeview",
        region: "oshawa",
        parentRegion: "durham-region",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-80, 44],
              [-79.9, 44],
              [-79.9, 44.1],
              [-80, 44.1],
              [-80, 44],
            ],
          ],
        },
      },
    ])
    // A listing inside that polygon -> the facet carries the hierarchy keys.
    await database.db.insert(listing).values({
      organizationId: orgId,
      source: "ddf",
      sourceListingId: "lv1",
      sourceKey: "KLV1",
      status: "active",
      data: { listPrice: 500000, latitude: 44.05, longitude: -79.95 },
    })
    const facets = await listAreaFacets(database.db, orgId)
    const lakeview = facets.find((f) => f.id === "gta_durham-region_oshawa_lakeview")
    expect(lakeview).toMatchObject({
      name: "Lakeview",
      region: "oshawa",
      parentRegion: "durham-region",
    })
  })

  it("listServiceAreaAreas bounds the curation pool to the service area", async () => {
    // The Ottawa square is around lng -75.75..-75.65, lat 45.38..45.45. A service area that contains
    // the square -> the area is a candidate (even though it's "Ottawa", count reflects listings).
    const inService = {
      minLng: -75.8,
      minLat: 45.35,
      maxLng: -75.6,
      maxLat: 45.5,
    }
    const candidates = await listServiceAreaAreas(database.db, orgId, { serviceArea: inService })
    expect(candidates.map((c) => c.id)).toContain("ottawa_test")
    // The empty area (far away) is NOT in the service area -> excluded.
    expect(candidates.map((c) => c.id)).not.toContain("empty_area")

    // A service area that excludes the Ottawa square -> ottawa_test not a candidate.
    const outService = { minLng: -80, minLat: 40, maxLng: -79, maxLat: 41 }
    const candidates2 = await listServiceAreaAreas(database.db, orgId, { serviceArea: outService })
    expect(candidates2.map((c) => c.id)).not.toContain("ottawa_test")

    // No service area -> every area is a candidate.
    const all = await listServiceAreaAreas(database.db, orgId)
    expect(all.map((c) => c.id)).toContain("ottawa_test")
    expect(all.map((c) => c.id)).toContain("empty_area")
  })
})
