import { config } from "dotenv"
import { z } from "zod"

// Imported first in index.ts so the repo-root .env is loaded before any module
// (e.g. @realtr/db) reads process.env. In production, env comes from the container.
config({ path: "../../.env" })

const workerEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith("postgres"), {
      message: "must be a PostgreSQL URL",
    }),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3003),
})

export interface WorkerEnvironment {
  databaseUrl: string
  healthPort: number
}

export function parseWorkerEnvironment(environment: NodeJS.ProcessEnv): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")
    throw new Error(`Invalid worker environment: ${fields || "configuration"}`)
  }
  return {
    databaseUrl: result.data.DATABASE_URL,
    healthPort: result.data.WORKER_HEALTH_PORT,
  }
}
