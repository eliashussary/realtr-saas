import { describe, expect, it } from "vitest"
import { assertTestDatabaseUrl } from "./database"

describe("assertTestDatabaseUrl", () => {
  it("accepts an explicit recognizable test database", () => {
    expect(assertTestDatabaseUrl("postgres://user:pass@localhost:5434/realtr_test")).toContain(
      "realtr_test",
    )
  })

  it("refuses a development database before making a connection", () => {
    expect(() => assertTestDatabaseUrl("postgres://user:pass@invalid.test:5432/realtr")).toThrow(
      "Refusing test cleanup",
    )
  })
})
