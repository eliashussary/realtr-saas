import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { organization, site } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("two-tenant database fixture", () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
    await cleanTestDatabase(database)
  })

  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("keeps each organization's records distinguishable", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    expect(alpha?.ids.organizationId).not.toBe(beta?.ids.organizationId)

    const alphaSites = await database.db
      .select()
      .from(site)
      .where(eq(site.organizationId, alpha?.ids.organizationId ?? ""))
    const betaOrganizations = await database.db
      .select()
      .from(organization)
      .where(eq(organization.id, beta?.ids.organizationId ?? ""))

    expect(alphaSites).toHaveLength(1)
    expect(alphaSites[0]?.name).toBe("Alpha Realty Site")
    expect(betaOrganizations[0]?.name).toBe("Beta Realty")
    expect(alphaSites[0]?.organizationId).not.toBe(betaOrganizations[0]?.id)
  })
})
