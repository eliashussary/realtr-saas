import { describe, expect, it } from "vitest"
import { rateLimited, screenLead } from "./leads-screen"

describe("screenLead", () => {
  it("drops honeypot submissions without validating", () => {
    expect(screenLead({ host: "x", trap: "bot", email: "a@b.co" })).toEqual({
      ok: false,
      status: "dropped",
    })
  })

  it("requires at least one contact channel", () => {
    expect(screenLead({ host: "x", name: "Jo" })).toEqual({
      ok: false,
      status: "invalid",
      reason: "contact_required",
    })
  })

  it("rejects a malformed email", () => {
    expect(screenLead({ host: "x", email: "not-an-email" })).toMatchObject({
      ok: false,
      reason: "email_invalid",
    })
  })

  it("accepts phone-only with no email", () => {
    expect(screenLead({ host: "x", phone: "555-1234" })).toMatchObject({ ok: true })
  })

  it("trims and returns cleaned fields", () => {
    const r = screenLead({ host: "x", name: "  Jo  ", email: " a@b.co ", message: "" })
    expect(r).toEqual({
      ok: true,
      fields: { name: "Jo", email: "a@b.co", phone: null, message: null },
    })
  })
})

describe("rateLimited", () => {
  it("allows up to the window cap, then blocks", () => {
    const now = 1000
    const key = "org:1.2.3.4"
    const results = Array.from({ length: 7 }, () => rateLimited(key, now))
    expect(results).toEqual([false, false, false, false, false, true, true])
  })

  it("resets after the window elapses", () => {
    const key = "org:9.9.9.9"
    for (let i = 0; i < 6; i++) rateLimited(key, 0)
    expect(rateLimited(key, 0)).toBe(true)
    expect(rateLimited(key, 60_000)).toBe(false)
  })
})
