import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { siteDocumentState } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("published-site host resolution", () => {
  let database: TestDatabase
  let resolvePublishedSite: typeof import("../../core/src/published").resolvePublishedSite
  let applicationPool: typeof import("../src/client").pool
  let applicationDb: typeof import("../src/client").db

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    resolvePublishedSite = (await import("../../core/src/published")).resolvePublishedSite
    const client = await import("../src/client")
    applicationPool = client.pool
    applicationDb = client.db
  })

  beforeEach(async () => cleanTestDatabase(database))

  afterAll(async () => {
    if (applicationPool) await applicationPool.end()
    if (database) {
      await cleanTestDatabase(database)
      await database.pool.end()
    }
  })

  async function seededTenants() {
    const tenants = await createTwoTenantFixture(database)
    await database.pool.query("select backfill_legacy_site_documents()")
    return tenants
  }

  it("resolves a servable host to its published revision, isolated per tenant", async () => {
    const [alpha, beta] = await seededTenants()
    if (!alpha || !beta) throw new Error("Missing fixture")

    const resolvedAlpha = await resolvePublishedSite(alpha.domain.hostname)
    expect(resolvedAlpha.status).toBe("ok")
    if (resolvedAlpha.status !== "ok") return
    expect(resolvedAlpha.siteId).toBe(alpha.site.id)
    expect((resolvedAlpha.document as { settings: { siteTitle: string } }).settings.siteTitle).toBe(
      alpha.site.name,
    )

    const resolvedBeta = await resolvePublishedSite(beta.domain.hostname)
    expect(resolvedBeta.status === "ok" && resolvedBeta.siteId).toBe(beta.site.id)
  })

  it("returns not_found for an unknown host", async () => {
    await seededTenants()
    await expect(resolvePublishedSite("nobody.example.com")).resolves.toEqual({
      status: "not_found",
    })
  })

  it("returns not_found for a site with no published pointer (private/unpublished)", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    await applicationDb
      .update(siteDocumentState)
      .set({ publishedRevisionId: null })
      .where(eq(siteDocumentState.siteId, alpha.site.id))

    await expect(resolvePublishedSite(alpha.domain.hostname)).resolves.toEqual({
      status: "not_found",
    })
  })

  it("does not serve a host whose domain is not in a servable state", async () => {
    const [, beta] = await seededTenants()
    if (!beta) throw new Error("Missing fixture")
    await database.pool.query("update domain set status = 'pending' where hostname = $1", [
      beta.domain.hostname,
    ])

    await expect(resolvePublishedSite(beta.domain.hostname)).resolves.toEqual({
      status: "not_found",
    })
  })
})
