import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { siteAuditEvent, siteDocumentState, siteRevision, user } from "../src/schema"
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

describe("site publication service", () => {
  let database: TestDatabase
  let publish: typeof import("../../../apps/app/src/server/site-publish")
  let onboarding: typeof import("../../../apps/app/src/server/onboarding")
  let applicationPool: typeof import("../src/client").pool
  let applicationDb: typeof import("../src/client").db

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    publish = await import("../../../apps/app/src/server/site-publish")
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

  function stateFor(siteId: string) {
    return applicationDb
      .select()
      .from(siteDocumentState)
      .where(eq(siteDocumentState.siteId, siteId))
      .then((rows) => rows[0])
  }

  it("publishes the current draft as a new immutable revision and moves the pointer", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const result = await publish.publishSite(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.publicationNumber).toBe(2n)

    const state = await stateFor(alpha.site.id)
    expect(state?.publishedRevisionId).toBe(result.revisionId)
    expect(state?.nextPublicationNumber).toBe(3n)
    // Publishing does not touch the draft version.
    expect(state?.draftVersion).toBe(1n)

    const revisions = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    expect(revisions).toHaveLength(2)

    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events[0]).toMatchObject({
      action: "site.publish",
      actorUserId: alpha.ids.userId,
      metadata: { publicationNumber: "2", revisionId: result.revisionId },
    })
  })

  it("first-publishes a freshly onboarded (private) site as publication one", async () => {
    await database.db
      .insert(user)
      .values({ id: "publish-user", name: "New", email: "publish@fixture.test" })
    const { siteId, organizationId } = await onboarding.provisionInitialWorkspace(applicationDb, {
      userId: "publish-user",
      email: "publish@fixture.test",
    })

    const before = await stateFor(siteId)
    expect(before?.publishedRevisionId).toBeNull()

    const result = await publish.publishSite(
      { ok: true, userId: "publish-user", organizationId, memberId: "m", role: "owner" },
      { siteId, expectedDraftVersion: 1n },
    )
    expect(result).toMatchObject({ ok: true, publicationNumber: 1n })
    const after = await stateFor(siteId)
    expect(after?.publishedRevisionId).not.toBeNull()
  })

  it("refuses a stale publish and leaves the live pointer unchanged", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const original = await stateFor(alpha.site.id)

    const result = await publish.publishSite(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 99n,
    })
    expect(result).toEqual({ ok: false, code: "stale", currentDraftVersion: 1n })

    const after = await stateFor(alpha.site.id)
    expect(after?.publishedRevisionId).toBe(original?.publishedRevisionId)
    expect(after?.nextPublicationNumber).toBe(2n)
    const revisions = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    expect(revisions).toHaveLength(1)
  })

  it("forbids publishing for non-owner/admin roles", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const result = await publish.publishSite(authorizationFor("alpha", "member"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(result).toEqual({ ok: false, code: "forbidden" })
    expect(
      await applicationDb
        .select()
        .from(siteAuditEvent)
        .where(eq(siteAuditEvent.siteId, alpha.site.id)),
    ).toHaveLength(0)
  })

  it("hides cross-tenant publish attempts as not_found without side effects", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")

    const result = await publish.publishSite(authorizationFor("beta"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(result).toEqual({ ok: false, code: "not_found" })
    const revisions = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    expect(revisions).toHaveLength(1)
  })

  it("returns a structured validation failure for a corrupt stored draft", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    await applicationDb
      .update(siteDocumentState)
      .set({ draftDocument: { schemaVersion: 1, pages: [] } })
      .where(eq(siteDocumentState.siteId, alpha.site.id))

    const result = await publish.publishSite(authorizationFor("alpha"), {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(result.ok).toBe(false)
    if (result.ok || result.code !== "invalid") throw new Error("Expected invalid")
    expect(result.issues.length).toBeGreaterThan(0)

    const revisions = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, alpha.site.id))
    expect(revisions).toHaveLength(1)
  })

  it("rolls back to a historical revision, resets the draft, and makes open editors stale", async () => {
    const [alpha] = await seededTenants()
    if (!alpha) throw new Error("Missing fixture")
    const auth = authorizationFor("alpha")

    const [firstRevision] = await applicationDb
      .select()
      .from(siteRevision)
      .where(and(eq(siteRevision.siteId, alpha.site.id), eq(siteRevision.publicationNumber, 1n)))
    if (!firstRevision) throw new Error("Missing publication one")

    const published = await publish.publishSite(auth, {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(published.ok).toBe(true)

    const rolledBack = await publish.rollbackSite(auth, {
      siteId: alpha.site.id,
      targetRevisionId: firstRevision.id,
      reason: "revert",
    })
    expect(rolledBack.ok).toBe(true)
    if (!rolledBack.ok) return
    expect(rolledBack.publicationNumber).toBe(3n)
    expect(rolledBack.draftVersion).toBe(2n)

    const [rollbackRevision] = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.id, rolledBack.revisionId))
    expect(rollbackRevision?.basedOnRevisionId).toBe(firstRevision.id)

    const state = await stateFor(alpha.site.id)
    expect(state?.publishedRevisionId).toBe(rolledBack.revisionId)
    expect(state?.draftVersion).toBe(2n)

    // An editor still holding draft version 1 can no longer publish.
    const stale = await publish.publishSite(auth, {
      siteId: alpha.site.id,
      expectedDraftVersion: 1n,
    })
    expect(stale).toEqual({ ok: false, code: "stale", currentDraftVersion: 2n })

    const events = await applicationDb
      .select()
      .from(siteAuditEvent)
      .where(eq(siteAuditEvent.siteId, alpha.site.id))
    expect(events.map((event) => event.action)).toEqual(["site.publish", "site.rollback"])
  })

  it("rejects rollback to an unknown or cross-tenant revision", async () => {
    const [alpha, beta] = await seededTenants()
    if (!alpha || !beta) throw new Error("Missing fixture")

    const [betaRevision] = await applicationDb
      .select()
      .from(siteRevision)
      .where(eq(siteRevision.siteId, beta.site.id))
    if (!betaRevision) throw new Error("Missing beta revision")

    // Alpha cannot roll back to beta's revision id.
    await expect(
      publish.rollbackSite(authorizationFor("alpha"), {
        siteId: alpha.site.id,
        targetRevisionId: betaRevision.id,
      }),
    ).resolves.toEqual({ ok: false, code: "not_found" })
  })
})
