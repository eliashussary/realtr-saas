import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { siteDocumentState, sitePreviewGrant, siteRevision } from "../src/schema"
import { createSiteDocumentRepository } from "../src/site-documents"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("site document persistence", () => {
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

  it("backfills legacy sites once with a draft and migration-authored publication", async () => {
    const tenants = await createTwoTenantFixture(database)

    const firstRun = await database.pool.query<{ backfilled: number }>(
      "select backfill_legacy_site_documents() as backfilled",
    )
    const secondRun = await database.pool.query<{ backfilled: number }>(
      "select backfill_legacy_site_documents() as backfilled",
    )

    expect(firstRun.rows[0]?.backfilled).toBe(2)
    expect(secondRun.rows[0]?.backfilled).toBe(0)

    const states = await database.db.select().from(siteDocumentState)
    const revisions = await database.db.select().from(siteRevision)
    expect(states).toHaveLength(2)
    expect(revisions).toHaveLength(2)

    for (const tenant of tenants) {
      const state = states.find((candidate) => candidate.siteId === tenant.site.id)
      const revision = revisions.find((candidate) => candidate.siteId === tenant.site.id)
      expect(state).toMatchObject({
        organizationId: tenant.ids.organizationId,
        draftSchemaVersion: 1,
        draftVersion: 1n,
        nextPublicationNumber: 2n,
        publishedRevisionId: revision?.id,
      })
      expect(revision).toMatchObject({
        organizationId: tenant.ids.organizationId,
        kind: "published",
        publicationNumber: 1n,
        actorType: "migration",
      })
      expect(state?.draftDocument).toMatchObject({
        schemaVersion: 1,
        template: { id: "modern", schemaVersion: 1 },
        settings: { siteTitle: tenant.site.name },
      })
      expect(revision?.document).toEqual(state?.draftDocument)
    }
  })

  it("scopes repository reads and revision writes to organization and site", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    if (!alpha || !beta) throw new Error("Missing tenant fixture")
    await database.pool.query("select backfill_legacy_site_documents()")
    const repository = createSiteDocumentRepository(database.db)

    await expect(
      repository.findState(alpha.ids.organizationId, alpha.site.id),
    ).resolves.toBeDefined()
    await expect(
      repository.findState(beta.ids.organizationId, alpha.site.id),
    ).resolves.toBeUndefined()

    const betaRevision = await database.db
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, beta.site.id))
      .then((rows) => rows[0])
    if (!betaRevision) throw new Error("Missing beta revision")

    await expect(
      repository.createRevision({
        organizationId: alpha.ids.organizationId,
        siteId: alpha.site.id,
        kind: "preview",
        document: {},
        schemaVersion: 1,
        sourceDraftVersion: 1n,
        actorType: "user",
        createdByUserId: alpha.ids.userId,
        basedOnRevisionId: betaRevision.id,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "site_revision_based_on_revision_fk", code: "23503" },
    })

    await expect(
      repository.createRevision({
        organizationId: beta.ids.organizationId,
        siteId: alpha.site.id,
        kind: "preview",
        document: {},
        schemaVersion: 1,
        sourceDraftVersion: 1n,
        actorType: "user",
        createdByUserId: beta.ids.userId,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "site_revision_organization_site_fk", code: "23503" },
    })
  })

  it("enforces preview and published-revision kind boundaries", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    if (!alpha || !beta) throw new Error("Missing tenant fixture")
    await database.pool.query("select backfill_legacy_site_documents()")
    const repository = createSiteDocumentRepository(database.db)
    const preview = await repository.createRevision({
      organizationId: alpha.ids.organizationId,
      siteId: alpha.site.id,
      kind: "preview",
      document: {},
      schemaVersion: 1,
      sourceDraftVersion: 1n,
      actorType: "user",
      createdByUserId: alpha.ids.userId,
    })

    await expect(
      database.db
        .update(siteDocumentState)
        .set({ publishedRevisionId: preview.id })
        .where(eq(siteDocumentState.siteId, alpha.site.id)),
    ).rejects.toMatchObject({
      cause: { constraint: "site_document_state_published_revision_fk", code: "23503" },
    })

    await expect(
      database.db.insert(sitePreviewGrant).values({
        organizationId: beta.ids.organizationId,
        siteId: beta.site.id,
        revisionId: preview.id,
        tokenHash: Buffer.from("wrong-tenant"),
        createdByUserId: beta.ids.userId,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "site_preview_grant_revision_fk", code: "23503" },
    })
  })

  it("makes revisions append-only at the database boundary", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    if (!alpha) throw new Error("Missing tenant fixture")
    await database.pool.query("select backfill_legacy_site_documents()")
    const [revision] = await database.db
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    if (!revision) throw new Error("Missing backfilled revision")

    await expect(
      database.db
        .update(siteRevision)
        .set({ reason: "mutated" })
        .where(eq(siteRevision.id, revision.id)),
    ).rejects.toMatchObject({ cause: { code: "55000" } })

    const stored = await database.db
      .select({ reason: siteRevision.reason })
      .from(siteRevision)
      .where(eq(siteRevision.id, revision.id))
    expect(stored[0]?.reason).toBe("Legacy site migration")
  })

  it("rejects invalid revision states and expired-at-creation preview grants", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    if (!alpha) throw new Error("Missing tenant fixture")
    await database.pool.query("select backfill_legacy_site_documents()")

    await expect(
      database.db.insert(siteRevision).values({
        organizationId: alpha.ids.organizationId,
        siteId: alpha.site.id,
        kind: "published",
        document: {},
        schemaVersion: 1,
        sourceDraftVersion: 1n,
        actorType: "system",
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "site_revision_publication_number_check", code: "23514" },
    })

    const [preview] = await database.db
      .insert(siteRevision)
      .values({
        organizationId: alpha.ids.organizationId,
        siteId: alpha.site.id,
        kind: "preview",
        document: {},
        schemaVersion: 1,
        sourceDraftVersion: 1n,
        actorType: "system",
      })
      .returning()
    if (!preview) throw new Error("Missing preview revision")

    await expect(
      database.db.insert(sitePreviewGrant).values({
        organizationId: alpha.ids.organizationId,
        siteId: alpha.site.id,
        revisionId: preview.id,
        tokenHash: Buffer.from("already-expired"),
        createdByUserId: alpha.ids.userId,
        expiresAt: new Date(0),
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "site_preview_grant_expiry_check", code: "23514" },
    })

    const result = await database.db.execute(
      sql`select count(*)::int as count from site_preview_grant`,
    )
    expect(result.rows[0]).toEqual({ count: 0 })
  })
})
