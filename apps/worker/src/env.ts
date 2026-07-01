import { config } from "dotenv"

// Imported first in index.ts so the repo-root .env is loaded before any module
// (e.g. @realtr/db) reads process.env. In production, env comes from the container.
config({ path: "../../.env" })
