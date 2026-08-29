import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createDomainRepository } from "../src/domains"
import { domain, site } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("domain repository", () => {
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

  async function seedDomain(organizationId: string, hostname: string) {
    const [siteRow] = await database.db
      .select({ id: site.id })
      .from(site)
      .where(eq(site.organizationId, organizationId))
      .limit(1)
    const [row] = await database.db
      .insert(domain)
      .values({
        siteId: siteRow?.id ?? "",
        hostname,
        status: "pending",
        verificationToken: randomUUID(),
      })
      .returning({ id: domain.id })
    return row?.id ?? ""
  }

  it("reads a domain and transitions its status", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const domainId = await seedDomain(alpha?.ids.organizationId ?? "", "www.example.com")
    const repository = createDomainRepository(database.db)

    const loaded = await repository.getDomain(domainId)
    expect(loaded).toMatchObject({ hostname: "www.example.com", status: "pending" })
    expect(loaded?.verificationToken).toBeTruthy()

    await repository.setStatus(domainId, "verified")
    const [after] = await database.db
      .select({ status: domain.status })
      .from(domain)
      .where(eq(domain.id, domainId))
    expect(after?.status).toBe("verified")
  })

  it("returns null for an unknown id", async () => {
    const repository = createDomainRepository(database.db)
    expect(await repository.getDomain(randomUUID())).toBeNull()
  })
})
