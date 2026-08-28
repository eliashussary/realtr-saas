import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { siteAuditEvent, sitePreviewGrant, siteRevision } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture, tenantFixtureIds } from "../src/test/fixtures"

type Authorization = {
  ok: true
  userId: string
  organizationId: string
  memberId: string
  role: string
}

function authorizationFor(key: "alpha" | "beta", role = "owner"): Authorization {
  return { ok: true, ...tenantFixtureIds[key], role }
}

describe("secure site preview", () => {
  let database: TestDatabase
  let preview: typeof import("../../../apps/app/src/server/site-preview")
  let resolvePreview: typeof import("../../core/src/preview").resolvePreview
  let applicationPool: typeof import("../src/client").pool
  let applicationDb: typeof import("../src/client").db

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    preview = await import("../../../apps/app/src/server/site-preview")
    resolvePreview = (await import("../../core/src/preview")).resolvePreview
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

  it("issues a preview snapshot resolvable by its raw token", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const issued = await preview.issuePreview(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const previewRevisions = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    expect(previewRevisions.some((revision) => revision.kind === "preview")).toBe(true)

    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events[0]).toMatchObject({ action: "site.preview.issue" })

    const resolved = await resolvePreview(issued.token)
    expect(resolved).not.toBeNull()
    expect((resolved as { settings: { siteTitle: string } }).settings.siteTitle).toBe(
      alpha.site.name,
    )

    // Access is recorded.
    const [grant] = await applicationDb
      .select()
      .from(sitePreviewGrant)
      .where(eq(sitePreviewGrant.id, issued.grantId))
    expect(grant?.lastUsedAt).not.toBeNull()
  })

  it("returns null for unknown, expired, and revoked tokens", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    expect(await resolvePreview("not-a-real-token")).toBeNull()

    // The expiry check constraint forbids storing a past expiry, so exercise the expiry branch by
    // resolving with a `now` beyond the 30-minute TTL.
    const expired = await preview.issuePreview(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    if (!expired.ok) throw new Error("Expected issue")
    const { createHash } = await import("node:crypto")
    const { createSiteDocumentRepository } = await import("../src/site-documents")
    const repository = createSiteDocumentRepository(applicationDb)
    const hash = createHash("sha256").update(expired.token).digest()
    const afterExpiry = new Date(Date.now() + preview.PREVIEW_TTL_MS + 60_000)
    expect(await repository.resolvePreviewGrant(hash, afterExpiry)).toBeUndefined()

    const revocable = await preview.issuePreview(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    if (!revocable.ok) throw new Error("Expected issue")
    await expect(
      preview.revokePreview(authorizationFor("alpha"), {
        siteId: alpha.site.id,
        grantId: revocable.grantId,
      }),
    ).resolves.toEqual({ ok: true })
    expect(await resolvePreview(revocable.token)).toBeNull()

    const actions = (
      await applicationDb
        .select()
        .from(siteAuditEvent)
        .where(eq(siteAuditEvent.siteId, alpha.site.id))
    ).map((event) => event.action)
    expect(actions).toContain("site.preview.revoke")
  })

  it("refuses to preview a stale draft version", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    await expect(
      preview.issuePreview(authorizationFor("alpha"), {
        siteId: alpha.site.id,
        expectedDraftVersion: 99n,
      }),
    ).resolves.toEqual({ ok: false, code: "stale", currentDraftVersion: 1n })
  })

  it("hides cross-tenant issue and revoke as not_found", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    await expect(
      preview.issuePreview(authorizationFor("beta"), {
        siteId: alpha.site.id,
        expectedDraftVersion: 1n,
      }),
    ).resolves.toEqual({ ok: false, code: "not_found" })

    const issued = await preview.issuePreview(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    if (!issued.ok) throw new Error("Expected issue")

    // Beta cannot revoke alpha's grant; alpha's token still resolves afterwards.
    await expect(
      preview.revokePreview(authorizationFor("beta"), {
        siteId: alpha.site.id,
        grantId: issued.grantId,
      }),
    ).resolves.toEqual({ ok: false, code: "not_found" })
    expect(await resolvePreview(issued.token)).not.toBeNull()
  })

  it("lets a non-admin member issue a preview", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const issued = await preview.issuePreview(authorizationFor("alpha", "member"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(issued.ok).toBe(true)
  })
})
