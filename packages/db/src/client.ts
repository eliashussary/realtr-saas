import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env")
}

export const pool = new Pool({ connectionString })
export const db: NodePgDatabase<typeof schema> = drizzle(pool, {
  schema,
  casing: "snake_case",
})

export type Db = typeof db
