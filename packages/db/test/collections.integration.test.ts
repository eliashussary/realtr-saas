import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  createCollection,
  deleteCollection,
  getPublishedCollectionBySlug,
  listCollectionsForOrg,
  listPublishedCollections,
  updateCollection,
} from "../src/collections"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

const base = {
  slug: "luxury-homes",
  name: "Luxury homes",
  description: "The finest.",
  filter: { minPrice: 1_500_000, sort: "price_desc" } as Record<string, unknown>,
  status: "draft" as const,
  rank: null,
}

describe("collection repository", () => {
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
  })

  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("creates, reads and stores the filter verbatim", async () => {
    const created = await createCollection(database.db, orgId, base)
    expect(created.filter).toEqual({ minPrice: 1_500_000, sort: "price_desc" })
    const all = await listCollectionsForOrg(database.db, orgId)
    expect(all).toHaveLength(1)
  })

  it("lists only published collections for the public reader, scoped to the tenant", async () => {
    await createCollection(database.db, orgId, base) // draft
    await createCollection(database.db, orgId, {
      ...base,
      slug: "condos",
      name: "Condos",
      status: "published",
      rank: 1,
    })
    await createCollection(database.db, otherOrgId, {
      ...base,
      slug: "condos",
      name: "Other tenant condos",
      status: "published",
    })

    const published = await listPublishedCollections(database.db, orgId)
    expect(published.map((c) => c.slug)).toEqual(["condos"])
    const bySlug = await getPublishedCollectionBySlug(database.db, orgId, "condos")
    expect(bySlug?.name).toBe("Condos")
    // draft is not publicly resolvable
    expect(await getPublishedCollectionBySlug(database.db, orgId, "luxury-homes")).toBeNull()
  })

  it("update and delete are tenant-scoped", async () => {
    const created = await createCollection(database.db, orgId, base)
    // wrong org cannot update or delete
    expect(await updateCollection(database.db, otherOrgId, created.id, base)).toBeNull()
    expect(await deleteCollection(database.db, otherOrgId, created.id)).toBe(false)
    // correct org can
    const updated = await updateCollection(database.db, orgId, created.id, {
      ...base,
      name: "Renamed",
      status: "published",
    })
    expect(updated?.name).toBe("Renamed")
    expect(await deleteCollection(database.db, orgId, created.id)).toBe(true)
    expect(await listCollectionsForOrg(database.db, orgId)).toHaveLength(0)
  })

  it("rejects a duplicate slug within one tenant", async () => {
    await createCollection(database.db, orgId, base)
    await expect(createCollection(database.db, orgId, base)).rejects.toMatchObject({
      cause: { constraint: "listing_collection_organization_slug_unique", code: "23505" },
    })
  })
})
