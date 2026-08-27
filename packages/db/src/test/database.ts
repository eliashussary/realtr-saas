import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import * as schema from "../schema"

export function assertTestDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests")
  }

  const url = new URL(value)
  const databaseName = url.pathname.slice(1)
  if (!/^(test_.+|.+_test)$/.test(databaseName)) {
    throw new Error(
      `Refusing test cleanup for database \"${databaseName}\": its name must start with test_ or end with _test`,
    )
  }

  return value
}

export interface TestDatabase {
  db: NodePgDatabase<typeof schema>
  pool: Pool
}

export function createTestDatabase(value = process.env.TEST_DATABASE_URL): TestDatabase {
  const connectionString = assertTestDatabaseUrl(value)
  const pool = new Pool({ connectionString })
  return {
    pool,
    db: drizzle(pool, { schema, casing: "snake_case" }),
  }
}

export async function migrateTestDatabase(database: TestDatabase): Promise<void> {
  await migrate(database.db, { migrationsFolder: "drizzle" })
}

export async function cleanTestDatabase(database: TestDatabase): Promise<void> {
  assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)
  await database.pool.query(
    'TRUNCATE TABLE "domain", "site", "member", "organization", "user" RESTART IDENTITY CASCADE',
  )
}
