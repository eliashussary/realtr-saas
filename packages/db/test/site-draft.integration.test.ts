import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { member, organization, site, siteAuditEvent, siteDocumentState, user } from "../src/schema"
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

function authorizationFor(key: "alpha" | "beta"): Authorization {
  const ids = tenantFixtureIds[key]
  return { ok: true, ...ids, role: "owner" }
}

describe("tenant-scoped draft API", () => {
  let database: TestDatabase
  let draft: typeof import("../../../apps/app/src/server/site-draft")
  let onboarding: typeof import("../../../apps/app/src/server/onboarding")
  let applicationPool: typeof import("../src/client").pool
  let applicationDb: typeof import("../src/client").db

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    draft = await import("../../../apps/app/src/server/site-draft")
    onboarding = await import("../../../apps/app/src/server/onboarding")
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

  it("loads an authorized draft and hides cross-tenant and missing sites identically", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const loaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.draftVersion).toBe(1n)
    expect(loaded.document.settings.siteTitle).toBe(alpha.site.name)

    // Beta cannot read alpha's site, and an unknown site looks the same.
    await expect(draft.loadSiteDraft(authorizationFor("beta"), alpha.site.id)).resolves.toEqual({
      ok: false,
      code: "not_found",
    })
    await expect(
      draft.loadSiteDraft(authorizationFor("alpha"), "00000000-0000-4000-8000-0000000000ff"),
    ).resolves.toEqual({ ok: false, code: "not_found" })
  })

  it("advances the draft on a matching version and audits the save", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const loaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!loaded.ok) throw new Error("Expected draft")

    const next = { ...loaded.document, settings: { ...loaded.document.settings, siteTitle: "New" } }
    const result = await draft.saveSiteDraft(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: next,
    })

    expect(result).toMatchObject({ ok: true, draftVersion: 2n })
    if (!result.ok) return
    expect(result.savedAt).toBeInstanceOf(Date)

    const reloaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!reloaded.ok) throw new Error("Expected reload")
    expect(reloaded.document.settings.siteTitle).toBe("New")

    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      organizationId: alpha.ids.organizationId,
      actorUserId: alpha.ids.userId,
      action: "site_draft.save",
      metadata: { draftVersion: "2" },
    })
  })

  it("rejects a stale concurrent edit without overwriting the newer draft", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const loaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!loaded.ok) throw new Error("Expected draft")
    const auth = authorizationFor("alpha")

    const tabA = { ...loaded.document, settings: { ...loaded.document.settings, siteTitle: "A" } }
    const tabB = { ...loaded.document, settings: { ...loaded.document.settings, siteTitle: "B" } }

    const first = await draft.saveSiteDraft(auth, {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: tabA,
    })
    expect(first).toMatchObject({ ok: true, draftVersion: 2n })

    const second = await draft.saveSiteDraft(auth, {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: tabB,
    })
    expect(second).toEqual({ ok: false, code: "stale", currentDraftVersion: 2n })

    // The stale writer did not win.
    const reloaded = await draft.loadSiteDraft(auth, alpha.site.id)
    if (!reloaded.ok) throw new Error("Expected reload")
    expect(reloaded.document.settings.siteTitle).toBe("A")
  })

  it("records a deliberate override with a distinct audit action", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const loaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!loaded.ok) throw new Error("Expected draft")

    await draft.saveSiteDraft(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: {
        ...loaded.document,
        settings: { ...loaded.document.settings, siteTitle: "Force" },
      },
      override: true,
    })

    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events).toHaveLength(1)
    expect(events[0]?.action).toBe("site_draft.override")
  })

  it("returns a structured validation failure for an invalid document", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const result = await draft.saveSiteDraft(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: { schemaVersion: 1, pages: [] },
    })

    expect(result.ok).toBe(false)
    if (result.ok || result.code !== "invalid") throw new Error("Expected invalid outcome")
    expect(result.issues.length).toBeGreaterThan(0)

    // An invalid save writes nothing: version unchanged, no audit event.
    const reloaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!reloaded.ok) throw new Error("Expected reload")
    expect(reloaded.draftVersion).toBe(1n)
    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events).toHaveLength(0)
  })

  it("does not save or audit across tenants for a valid document", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const loaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!loaded.ok) throw new Error("Expected draft")

    // Beta authorization, alpha's site id, otherwise-valid payload.
    const result = await draft.saveSiteDraft(authorizationFor("beta"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
      document: loaded.document,
    })
    expect(result).toEqual({ ok: false, code: "not_found" })

    const events = await applicationDb.select().from(siteAuditEvent)
    expect(events).toHaveLength(0)
    const reloaded = await draft.loadSiteDraft(authorizationFor("alpha"), alpha.site.id)
    if (!reloaded.ok) throw new Error("Expected reload")
    expect(reloaded.draftVersion).toBe(1n)
  })

  it("onboards a new workspace with a private draft state atomically", async () => {
    await database.db
      .insert(user)
      .values({ id: "onboard-user", name: "New Realtor", email: "new@fixture.test" })

    const { organizationId, siteId } = await onboarding.provisionInitialWorkspace(applicationDb, {
      userId: "onboard-user",
      email: "new@fixture.test",
    })

    const [org] = await database.db
      .select()
      .from(organization)
      .where(eq(organization.id, organizationId))
    expect(org).toBeDefined()

    const [membership] = await database.db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, "onboard-user")))
    expect(membership?.role).toBe("owner")

    const [createdSite] = await database.db.select().from(site).where(eq(site.id, siteId))
    expect(createdSite?.organizationId).toBe(organizationId)

    const [state] = await database.db
      .select()
      .from(siteDocumentState)
      .where(eq(siteDocumentState.siteId, siteId))
    expect(state).toMatchObject({
      organizationId,
      draftSchemaVersion: 1,
      draftVersion: 1n,
      publishedRevisionId: null,
    })
    expect(state?.draftDocument).toMatchObject({ schemaVersion: 1, template: { id: "modern" } })
  })
})
