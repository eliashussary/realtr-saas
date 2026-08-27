import { describe, expect, it } from "vitest"
import { parseWorkerEnvironment } from "./env"

describe("worker environment", () => {
  it("parses explicit settings", () => {
    expect(
      parseWorkerEnvironment({
        DATABASE_URL: "postgres://worker:secret@localhost:5432/realtr",
        WORKER_HEALTH_PORT: "3103",
      }),
    ).toEqual({
      databaseUrl: "postgres://worker:secret@localhost:5432/realtr",
      healthPort: 3103,
    })
  })

  it("reports field names without leaking secret values", () => {
    const secret = "mysql://user:do-not-print@localhost/realtr"
    expect(() => parseWorkerEnvironment({ DATABASE_URL: secret })).toThrow(
      "Invalid worker environment: DATABASE_URL",
    )
    try {
      parseWorkerEnvironment({ DATABASE_URL: secret })
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
