import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  createGraceSweepRepository,
  findOrgByStripeCustomerId,
  getSubscriptionByOrg,
  hasBillingEvent,
  recordBillingEvent,
  writeSubscriptionMirror,
} from "../src/billing"
import { billingEvent } from "../src/schema"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

function mirror(organizationId: string, over: Record<string, unknown> = {}) {
  return {
    organizationId,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    planId: "team",
    status: "active",
    seatQuantity: 2,
    currentPeriodEnd: new Date("2026-09-29T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    ...over,
  }
}

describe("billing webhook repository", () => {
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

  it("upserts the mirror by org (webhook re-runs converge in place)", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""

    await writeSubscriptionMirror(database.db, mirror(organizationId, { status: "trialing" }))
    await writeSubscriptionMirror(
      database.db,
      mirror(organizationId, { status: "active", seatQuantity: 3 }),
    )

    const row = await getSubscriptionByOrg(database.db, organizationId)
    expect(row).toMatchObject({ status: "active", seatQuantity: 3, planId: "team" })
  })

  it("records event ids idempotently and reports duplicates", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""

    expect(await hasBillingEvent(database.db, "evt_1")).toBe(false)
    await recordBillingEvent(database.db, { stripeEventId: "evt_1", type: "x", organizationId })
    // A replayed delivery of the same event id must not error or duplicate the ledger row.
    await recordBillingEvent(database.db, { stripeEventId: "evt_1", type: "x", organizationId })

    expect(await hasBillingEvent(database.db, "evt_1")).toBe(true)
    const rows = await database.db
      .select()
      .from(billingEvent)
      .where(eq(billingEvent.stripeEventId, "evt_1"))
    expect(rows).toHaveLength(1)
  })

  it("resolves an org from its Stripe customer id", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const organizationId = alpha?.ids.organizationId ?? ""
    await writeSubscriptionMirror(
      database.db,
      mirror(organizationId, { stripeCustomerId: "cus_x" }),
    )

    expect(await findOrgByStripeCustomerId(database.db, "cus_x")).toBe(organizationId)
    expect(await findOrgByStripeCustomerId(database.db, "cus_missing")).toBeNull()
  })

  it("grace sweep lists only expired past_due rows and lapses them (guarded to past_due)", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const expiredOrg = alpha?.ids.organizationId ?? ""
    const withinOrg = beta?.ids.organizationId ?? ""
    const past = new Date("2026-08-28T00:00:00.000Z")
    const future = new Date("2026-08-30T00:00:00.000Z")
    const now = new Date("2026-08-29T00:00:00.000Z")

    await writeSubscriptionMirror(
      database.db,
      mirror(expiredOrg, { status: "past_due", graceEndsAt: past }),
    )
    await writeSubscriptionMirror(
      database.db,
      mirror(withinOrg, { status: "past_due", graceEndsAt: future }),
    )

    const repo = createGraceSweepRepository(database.db)
    const candidates = await repo.listGraceCandidates(now)
    expect(candidates.map((c) => c.organizationId)).toEqual([expiredOrg])

    await repo.markLapsed(expiredOrg)
    expect((await getSubscriptionByOrg(database.db, expiredOrg))?.status).toBe("lapsed")
    // The within-grace tenant is untouched.
    expect((await getSubscriptionByOrg(database.db, withinOrg))?.status).toBe("past_due")

    // markLapsed is guarded: an active subscription is never lapsed.
    await writeSubscriptionMirror(database.db, mirror(withinOrg, { status: "active" }))
    await repo.markLapsed(withinOrg)
    expect((await getSubscriptionByOrg(database.db, withinOrg))?.status).toBe("active")
  })
})
