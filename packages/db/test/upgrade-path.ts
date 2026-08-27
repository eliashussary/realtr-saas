import { readFile } from "node:fs/promises"
import { Pool } from "pg"
import { assertTestDatabaseUrl } from "../src/test/database"

const sourceUrl = new URL(assertTestDatabaseUrl(process.env.TEST_DATABASE_URL))
const sourceDatabase = sourceUrl.pathname.slice(1)
const upgradeDatabase = `${sourceDatabase.replace(/_test$/, "")}_upgrade_test`
if (!/^[a-z0-9_]+_test$/.test(upgradeDatabase)) {
  throw new Error(`Refusing unsafe upgrade database name: ${upgradeDatabase}`)
}

const adminUrl = new URL(sourceUrl)
adminUrl.pathname = "/postgres"
const upgradeUrl = new URL(sourceUrl)
upgradeUrl.pathname = `/${upgradeDatabase}`
const quotedDatabase = `"${upgradeDatabase.replaceAll('"', '""')}"`
const admin = new Pool({ connectionString: adminUrl.toString() })
let upgrade: Pool | undefined

async function dropUpgradeDatabase() {
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [upgradeDatabase],
  )
  await admin.query(`drop database if exists ${quotedDatabase}`)
}

try {
  await dropUpgradeDatabase()
  await admin.query(`create database ${quotedDatabase}`)
  upgrade = new Pool({ connectionString: upgradeUrl.toString() })

  const migration0 = await readFile("drizzle/0000_abandoned_boom_boom.sql", "utf8")
  const migration1 = await readFile("drizzle/0001_fast_warpath.sql", "utf8")
  const migration2 = await readFile("drizzle/0002_mute_justin_hammer.sql", "utf8")
  const migration3 = await readFile("drizzle/0003_workable_firestar.sql", "utf8")
  await upgrade.query(migration0)
  await upgrade.query(migration1)
  await upgrade.query(`
    insert into "organization" ("id", "name", "slug")
    values ('upgrade-org', 'Upgrade Realty', 'upgrade-realty');
    insert into "site" ("id", "organization_id", "name", "template_id", "theme", "pages")
    values (
      '00000000-0000-4000-8000-000000000099',
      'upgrade-org',
      'Upgrade Site',
      'modern',
      '{"radius":"1rem"}'::jsonb,
      '{"/":{"root":{"props":{"title":"Legacy Home"}},"content":[],"zones":{}}}'::jsonb
    );
  `)

  await upgrade.query(migration2)
  await upgrade.query(migration3)
  const result = await upgrade.query<{
    draft_title: string
    kind: string
    organization_id: string
    publication_number: string
  }>(`
    select
      state.draft_document #>> '{pages,0,title}' as draft_title,
      revision.kind,
      revision.organization_id,
      revision.publication_number::text
    from site_document_state state
    join site_revision revision on revision.id = state.published_revision_id
    where state.site_id = '00000000-0000-4000-8000-000000000099'
  `)
  const row = result.rows[0]
  if (
    row?.draft_title !== "Legacy Home" ||
    row.kind !== "published" ||
    row.organization_id !== "upgrade-org" ||
    row.publication_number !== "1"
  ) {
    throw new Error(`Legacy upgrade assertion failed: ${JSON.stringify(row)}`)
  }

  const retry = await upgrade.query<{ backfilled: number }>(
    "select backfill_legacy_site_documents() as backfilled",
  )
  if (retry.rows[0]?.backfilled !== 0) {
    throw new Error("Legacy backfill was not idempotent after upgrade")
  }
  console.log("Legacy site document upgrade path passed")
} finally {
  if (upgrade) await upgrade.end()
  await dropUpgradeDatabase()
  await admin.end()
}
