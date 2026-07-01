import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// .env lives at the repo root.
config({ path: "../../.env" })

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://realtr:realtr@localhost:5433/realtr",
  },
  casing: "snake_case",
})
