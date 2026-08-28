import { randomUUID } from "node:crypto"
import { config } from "dotenv"

// Load root .env before importing the client (which reads DATABASE_URL at import).
config({ path: "../../.env" })

const { db, pool } = await import("./client")
const { user, organization, member, site, domain } = await import("./schema")

// Deterministic ids so re-seeding is idempotent.
const USER_ID = "seed-user-demo"
const ORG_ID = "seed-org-demo"
const MEMBER_ID = "seed-member-demo"
const SITE_ID = "00000000-0000-4000-8000-000000000001"

async function main() {
  await db
    .insert(user)
    .values({
      id: USER_ID,
      name: "Demo Realtor",
      email: "demo@realtr.app",
      emailVerified: true,
    })
    .onConflictDoNothing()

  await db
    .insert(organization)
    .values({ id: ORG_ID, name: "Demo Realty", slug: "demo" })
    .onConflictDoNothing()

  await db
    .insert(member)
    .values({ id: MEMBER_ID, organizationId: ORG_ID, userId: USER_ID, role: "owner" })
    .onConflictDoNothing()

  // Empty theme/pages => renderer falls back to the template's defaults.
  await db
    .insert(site)
    .values({
      id: SITE_ID,
      organizationId: ORG_ID,
      name: "Demo Site",
      templateId: "modern",
      theme: {},
      pages: {},
    })
    .onConflictDoNothing()

  await db
    .insert(domain)
    .values({
      siteId: SITE_ID,
      hostname: "demo.localhost",
      status: "active",
      verificationToken: randomUUID(),
      isPrimary: true,
    })
    .onConflictDoNothing()

  // Give the seeded (legacy-shaped) site a draft + published revision, same as the migration
  // backfill. Idempotent: it skips sites that already have document state.
  const { sql } = await import("drizzle-orm")
  await db.execute(sql`select backfill_legacy_site_documents()`)

  console.log("Seeded demo org + site + domain (demo.localhost -> Demo Site).")
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err)
    return pool.end().finally(() => process.exit(1))
  })
