import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { describeError, logger, newCorrelationId, reportError } from "./log"

// Force production mode so events render as one JSON object per line (the ingestible format).
const originalEnv = process.env.NODE_ENV
const originalLevel = process.env.LOG_LEVEL

beforeEach(() => {
  process.env.NODE_ENV = "production"
  process.env.LOG_LEVEL = "debug"
})
afterEach(() => {
  process.env.NODE_ENV = originalEnv
  process.env.LOG_LEVEL = originalLevel
  vi.restoreAllMocks()
})

function captured(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return JSON.parse((spy.mock.calls.at(-1)?.[0] as string) ?? "{}")
}

describe("logger", () => {
  it("emits structured JSON with level, msg, and merged fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.info("sync.start", { organizationId: "org-1" })
    const record = captured(spy)
    expect(record).toMatchObject({ level: "info", msg: "sync.start", organizationId: "org-1" })
    expect(typeof record.time).toBe("string")
  })

  it("child loggers merge base context (correlation) into every event", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    logger.child({ queue: "lead-delivery", correlationId: "abc123" }).info("job.finish", { ms: 5 })
    expect(captured(spy)).toMatchObject({
      queue: "lead-delivery",
      correlationId: "abc123",
      msg: "job.finish",
      ms: 5,
    })
  })

  it("respects LOG_LEVEL threshold", () => {
    process.env.LOG_LEVEL = "warn"
    const info = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    logger.info("below-threshold")
    logger.warn("at-threshold")
    expect(info).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("reportError logs message + stack + context at error level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    reportError(new Error("boom"), { component: "billing" })
    const record = captured(spy)
    expect(record).toMatchObject({ level: "error", msg: "boom", component: "billing" })
    expect(typeof record.stack).toBe("string")
  })
})

describe("helpers", () => {
  it("describeError normalizes Error and non-Error throws", () => {
    expect(describeError(new Error("x")).message).toBe("x")
    expect(describeError("plain string").message).toBe("plain string")
  })

  it("newCorrelationId returns a short id", () => {
    const id = newCorrelationId()
    expect(id).toMatch(/^[a-z0-9]+$/)
    expect(id.length).toBeGreaterThan(3)
  })
})
