import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteOrganization, exportOrganizationData } from "../src/data-export"
import { createListingRepository } from "../src/listings"
import { integration, listing, member, organization, site } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("tenant data export + erasure", () => {
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

  it("exports the tenant's own data and nothing from other tenants", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const alphaOrg = alpha?.ids.organizationId ?? ""
    const repo = createListingRepository(database.db)
    await repo.upsertListings(alphaOrg, "ddf", [
      { sourceListingId: "ID-A", sourceKey: "A", status: "active", data: { key: "A" } },
    ])
    await repo.upsertListings(beta?.ids.organizationId ?? "", "ddf", [
      { sourceListingId: "ID-B", sourceKey: "B", status: "active", data: { key: "B" } },
    ])

    const dump = await exportOrganizationData(database.db, alphaOrg)
    expect(dump.organization?.id).toBe(alphaOrg)
    expect(dump.members.length).toBeGreaterThanOrEqual(1)
    expect(dump.listings).toHaveLength(1)
    expect((dump.listings[0] as { sourceKey?: string }).sourceKey).toBe("A")
    expect(dump.exportedAt).toBeTruthy()
  })

  it("redacts integration credentials in the export", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const alphaOrg = alpha?.ids.organizationId ?? ""
    await database.db.insert(integration).values({
      organizationId: alphaOrg,
      kind: "crm",
      provider: "fub",
      status: "connected",
      config: { enc: "iv.tag.ciphertext" },
    })
    const dump = await exportOrganizationData(database.db, alphaOrg)
    expect(dump.integrations).toHaveLength(1)
    expect((dump.integrations[0] as { config?: unknown }).config).toBe("[redacted]")
  })

  it("erases the tenant and cascades to its data, leaving other tenants intact", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const alphaOrg = alpha?.ids.organizationId ?? ""
    const betaOrg = beta?.ids.organizationId ?? ""
    const repo = createListingRepository(database.db)
    await repo.upsertListings(alphaOrg, "ddf", [
      { sourceListingId: "ID-A", sourceKey: "A", status: "active", data: {} },
    ])

    await deleteOrganization(database.db, alphaOrg)

    expect(
      await database.db.select().from(organization).where(eq(organization.id, alphaOrg)),
    ).toHaveLength(0)
    // Cascade removed alpha's members, sites, and listings.
    expect(
      await database.db.select().from(member).where(eq(member.organizationId, alphaOrg)),
    ).toHaveLength(0)
    expect(
      await database.db.select().from(site).where(eq(site.organizationId, alphaOrg)),
    ).toHaveLength(0)
    expect(
      await database.db.select().from(listing).where(eq(listing.organizationId, alphaOrg)),
    ).toHaveLength(0)
    // Beta is untouched.
    expect(
      await database.db.select().from(organization).where(eq(organization.id, betaOrg)),
    ).toHaveLength(1)
  })
})
