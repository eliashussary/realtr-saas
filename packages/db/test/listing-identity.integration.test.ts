import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { listing } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("tenant-scoped listing identity", () => {
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

  it("allows the same provider identity in different organizations", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)

    const rows = await database.db
      .insert(listing)
      .values([
        {
          organizationId: alpha?.ids.organizationId ?? "",
          source: "ddf",
          sourceListingId: "123",
          sourceKey: "KEY-123",
        },
        {
          organizationId: beta?.ids.organizationId ?? "",
          source: "ddf",
          sourceListingId: "123",
          sourceKey: "KEY-123",
        },
      ])
      .returning()

    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.organizationId))).toEqual(
      new Set([alpha?.ids.organizationId, beta?.ids.organizationId]),
    )
  })

  it("rejects a duplicate provider identity within one organization", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const identity = {
      organizationId: alpha?.ids.organizationId ?? "",
      source: "ddf",
      sourceListingId: "123",
      sourceKey: "KEY-123",
    }

    await database.db.insert(listing).values(identity)

    await expect(database.db.insert(listing).values(identity)).rejects.toMatchObject({
      constraint: "listing_organization_source_source_listing_id_unique",
      code: "23505",
    })
  })
})
