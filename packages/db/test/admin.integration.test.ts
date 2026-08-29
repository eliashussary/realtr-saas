import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { listAdminAudit, listTenantHealth, recordAdminAudit } from "../src/admin"
import { writeSubscriptionMirror } from "../src/billing"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

describe("admin operations repository", () => {
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

  it("records and lists admin audit events, newest first, joined to the org", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""

    await recordAdminAudit(database.db, {
      actorEmail: "ops@realtr.app",
      action: "sync.trigger",
      targetOrganizationId: organizationId,
      detail: { mode: "reconcile" },
    })
    await recordAdminAudit(database.db, {
      actorEmail: "ops@realtr.app",
      action: "billing.extend_grace",
      targetOrganizationId: organizationId,
      detail: { days: 7 },
    })

    const events = await listAdminAudit(database.db, 10)
    expect(events).toHaveLength(2)
    expect(events[0]?.action).toBe("billing.extend_grace") // newest first
    expect(events[0]?.organizationName).toBeTruthy()
    expect(events[1]?.detail).toMatchObject({ mode: "reconcile" })
  })

  it("summarizes tenant health with subscription, listings, and lead delivery counts", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const alphaOrg = alpha?.ids.organizationId ?? ""
    await writeSubscriptionMirror(database.db, {
      organizationId: alphaOrg,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      planId: "team",
      status: "active",
      seatQuantity: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      graceEndsAt: null,
    })

    const rows = await listTenantHealth(database.db)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const alphaRow = rows.find((r) => r.organizationId === alphaOrg)
    expect(alphaRow).toMatchObject({
      subscriptionStatus: "active",
      planId: "team",
      ddfConnected: false,
      crmConnected: false,
      activeListings: 0,
      leadCount: 0,
      undeliveredLeads: 0,
    })
    // The beta tenant has no subscription mirror → "none".
    const betaRow = rows.find((r) => r.organizationId === (beta?.ids.organizationId ?? ""))
    expect(betaRow?.subscriptionStatus).toBe("none")
  })
})
