import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  countListings,
  listingBounds,
  listingFacets,
  listingMapMarkers,
  searchListings,
} from "../src/listings"
import { listing } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

// A listing's normalized `data` blob, shaped like @realtr/core's normalizeDdfProperty output; the
// generated facet columns (list_price, bedrooms, …) are derived from it by Postgres.
function listingData(over: {
  price?: number
  beds?: number
  baths?: number
  type?: string
  city?: string
  province?: string
  lat?: number
  lng?: number
}) {
  return {
    listPrice: over.price,
    bedrooms: over.beds,
    bathrooms: over.baths,
    propertyType: over.type,
    address: { city: over.city, province: over.province ?? "ON" },
    latitude: over.lat,
    longitude: over.lng,
  }
}

describe("listing faceted search", () => {
  let database: TestDatabase
  let orgId: string
  let otherOrgId: string

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
  })

  beforeEach(async () => {
    await cleanTestDatabase(database)
    const [alpha, beta] = await createTwoTenantFixture(database)
    orgId = alpha?.ids.organizationId ?? ""
    otherOrgId = beta?.ids.organizationId ?? ""
    await database.db.insert(listing).values([
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a1",
        sourceKey: "KA1",
        status: "active",
        sourceModifiedAt: new Date("2026-01-01"),
        data: listingData({
          price: 400000,
          beds: 3,
          baths: 2,
          type: "House",
          city: "Ottawa",
          lat: 45.4,
          lng: -75.7,
        }),
      },
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a2",
        sourceKey: "KA2",
        status: "active",
        sourceModifiedAt: new Date("2026-02-01"),
        data: listingData({
          price: 800000,
          beds: 4,
          baths: 3,
          type: "House",
          city: "Kanata",
          lat: 45.3,
          lng: -75.9,
        }),
      },
      {
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a3",
        sourceKey: "KA3",
        status: "active",
        sourceModifiedAt: new Date("2026-03-01"),
        data: listingData({
          price: 300000,
          beds: 2,
          baths: 1,
          type: "Condo",
          city: "Ottawa",
          lat: 45.42,
          lng: -75.69,
        }),
      },
      {
        // removed rows must never surface in the public search
        organizationId: orgId,
        source: "ddf",
        sourceListingId: "a4",
        sourceKey: "KA4",
        status: "removed",
        data: listingData({ price: 350000, beds: 3, baths: 2, type: "House", city: "Ottawa" }),
      },
      {
        // a different tenant's listing must never leak across orgs
        organizationId: otherOrgId,
        source: "ddf",
        sourceListingId: "b1",
        sourceKey: "KB1",
        status: "active",
        data: listingData({ price: 500000, beds: 3, baths: 2, type: "House", city: "Ottawa" }),
      },
    ])
  })

  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("projects facet columns from the data blob and filters on price range", async () => {
    const rows = await searchListings(database.db, orgId, { minPrice: 350000, maxPrice: 500000 })
    expect(rows.map((r) => r.sourceListingId)).toEqual(["a1"])
  })

  it("filters by minimum beds/baths (at least)", async () => {
    const rows = await searchListings(database.db, orgId, { minBeds: 3 })
    expect(new Set(rows.map((r) => r.sourceListingId))).toEqual(new Set(["a1", "a2"]))
  })

  it("filters by property type and city (in-list)", async () => {
    const rows = await searchListings(database.db, orgId, {
      propertyType: ["House"],
      city: ["Ottawa"],
    })
    expect(rows.map((r) => r.sourceListingId)).toEqual(["a1"])
  })

  it("excludes removed rows and other tenants", async () => {
    const rows = await searchListings(database.db, orgId, {})
    expect(new Set(rows.map((r) => r.sourceListingId))).toEqual(new Set(["a1", "a2", "a3"]))
  })

  it("sorts by price ascending and descending", async () => {
    const asc = await searchListings(database.db, orgId, {}, {})
    // default order is featured-then-recency; assert explicit price sorts instead
    expect(asc.length).toBe(3)
    const byPriceAsc = await searchListings(database.db, orgId, { sort: "price_asc" })
    expect(byPriceAsc.map((r) => r.sourceListingId)).toEqual(["a3", "a1", "a2"])
    const byPriceDesc = await searchListings(database.db, orgId, { sort: "price_desc" })
    expect(byPriceDesc.map((r) => r.sourceListingId)).toEqual(["a2", "a1", "a3"])
  })

  it("paginates with limit/offset", async () => {
    const page1 = await searchListings(
      database.db,
      orgId,
      { sort: "price_asc" },
      { limit: 2, offset: 0 },
    )
    const page2 = await searchListings(
      database.db,
      orgId,
      { sort: "price_asc" },
      { limit: 2, offset: 2 },
    )
    expect(page1.map((r) => r.sourceListingId)).toEqual(["a3", "a1"])
    expect(page2.map((r) => r.sourceListingId)).toEqual(["a2"])
  })

  it("counts matches for a filter", async () => {
    expect(await countListings(database.db, orgId, {})).toBe(3)
    expect(await countListings(database.db, orgId, { propertyType: ["Condo"] })).toBe(1)
    expect(await countListings(database.db, orgId, { minPrice: 1000000 })).toBe(0)
  })

  it("returns type/city facets with counts over the active set only", async () => {
    const facets = await listingFacets(database.db, orgId)
    expect(facets.propertyTypes).toEqual([
      { value: "House", count: 2 },
      { value: "Condo", count: 1 },
    ])
    expect(new Set(facets.cities.map((c) => c.value))).toEqual(new Set(["Ottawa", "Kanata"]))
    expect(facets.cities.find((c) => c.value === "Ottawa")?.count).toBe(2)
  })

  it("computes a bounding box and markers over the filtered set", async () => {
    const bounds = await listingBounds(database.db, orgId, {})
    expect(bounds).not.toBeNull()
    expect(bounds?.minLat).toBeCloseTo(45.3)
    expect(bounds?.maxLat).toBeCloseTo(45.42)
    const markers = await listingMapMarkers(database.db, orgId, { propertyType: ["Condo"] })
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ sourceListingId: "a3", listPrice: 300000 })
  })
})
