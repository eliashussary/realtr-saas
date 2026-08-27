import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { user } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("organization authorization guard", () => {
  let database: TestDatabase
  let fixture: Awaited<ReturnType<typeof createTwoTenantFixture>>
  let authorization: typeof import("../../../apps/app/src/server/authorization")
  let applicationPool: typeof import("../src/client").pool

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
    await cleanTestDatabase(database)
    fixture = await createTwoTenantFixture(database)

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    authorization = await import("../../../apps/app/src/server/authorization")
    applicationPool = (await import("../src/client")).pool
  })

  afterAll(async () => {
    if (database) await cleanTestDatabase(database)
    if (applicationPool) await applicationPool.end()
    if (database) await database.pool.end()
  })

  it("returns a typed unauthenticated outcome without a session", async () => {
    await expect(authorization.resolveOrganizationAuthorization(null)).resolves.toEqual({
      ok: false,
      code: "unauthenticated",
    })
  })

  it("returns a typed forbidden outcome when no membership exists", async () => {
    await database.db.insert(user).values({
      id: "test-user-no-membership",
      name: "No Membership",
      email: "no-membership@fixture.test",
    })

    await expect(
      authorization.resolveOrganizationAuthorization({
        user: { id: "test-user-no-membership" },
        session: { activeOrganizationId: null },
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" })
  })

  it("derives the authorized organization, membership, and role from storage", async () => {
    const alpha = fixture[0]
    expect(alpha).toBeDefined()
    if (!alpha) return

    await expect(
      authorization.resolveOrganizationAuthorization({
        user: { id: alpha.ids.userId },
        session: { activeOrganizationId: alpha.ids.organizationId },
      }),
    ).resolves.toEqual({
      ok: true,
      userId: alpha.ids.userId,
      organizationId: alpha.ids.organizationId,
      memberId: alpha.ids.memberId,
      role: "owner",
    })
  })

  it("denies an active organization for which the user has no membership", async () => {
    const [alpha, beta] = fixture
    expect(alpha).toBeDefined()
    expect(beta).toBeDefined()
    if (!alpha || !beta) return

    await expect(
      authorization.resolveOrganizationAuthorization({
        user: { id: alpha.ids.userId },
        session: { activeOrganizationId: beta.ids.organizationId },
      }),
    ).resolves.toEqual({ ok: false, code: "forbidden" })
  })

  it("returns the same not_found outcome for missing and cross-tenant sites", async () => {
    const [alpha, beta] = fixture
    expect(alpha).toBeDefined()
    expect(beta).toBeDefined()
    if (!alpha || !beta) return

    const context = await authorization.resolveOrganizationAuthorization({
      user: { id: alpha.ids.userId },
      session: { activeOrganizationId: alpha.ids.organizationId },
    })
    expect(context.ok).toBe(true)
    if (!context.ok) return

    await expect(authorization.findAuthorizedSite(context, alpha.site.id)).resolves.toMatchObject({
      id: alpha.site.id,
      organizationId: alpha.ids.organizationId,
    })
    await expect(authorization.findAuthorizedSite(context, beta.site.id)).resolves.toEqual({
      ok: false,
      code: "not_found",
    })
    await expect(
      authorization.findAuthorizedSite(context, "00000000-0000-0000-0000-000000000000"),
    ).resolves.toEqual({ ok: false, code: "not_found" })
    expect(authorization.authorizeOrganizationTarget(context, beta.ids.organizationId)).toEqual({
      ok: false,
      code: "forbidden",
    })
  })
})
