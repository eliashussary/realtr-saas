import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { emailConfigured, sendEmail } from "./email"

const original = {
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
}

beforeEach(() => {
  process.env.NODE_ENV = "test"
  // Empty string is falsy, so resendConfig() treats it as unset — and avoids the `delete` operator.
  // (Assigning `undefined` would coerce to the truthy string "undefined".)
  process.env.RESEND_API_KEY = ""
  process.env.RESEND_FROM = ""
})
afterEach(() => {
  process.env.NODE_ENV = original.NODE_ENV
  process.env.RESEND_API_KEY = original.RESEND_API_KEY ?? ""
  process.env.RESEND_FROM = original.RESEND_FROM ?? ""
  vi.restoreAllMocks()
})

describe("emailConfigured", () => {
  it("is false without a key, true with one", () => {
    expect(emailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = "re_test"
    expect(emailConfigured()).toBe(true)
  })
})

describe("sendEmail", () => {
  it("logs (does not throw or fetch) when unconfigured in dev", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(
      sendEmail({ to: "a@example.com", subject: "hi", text: "there" }),
    ).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not leak the body (no fetch, no throw) when unconfigured in production", async () => {
    process.env.NODE_ENV = "production"
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(
      sendEmail({ to: "a@example.com", subject: "s", text: "body" }),
    ).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("POSTs to Resend with normalized recipients when configured", async () => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.RESEND_FROM = "Realtr <no@realtr.app>"
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))
    await sendEmail({ to: ["a@example.com", "b@example.com"], subject: "s", text: "t" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe("https://api.resend.com/emails")
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      from: "Realtr <no@realtr.app>",
      to: ["a@example.com", "b@example.com"],
      subject: "s",
    })
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer re_test" })
  })

  it("throws when Resend returns a non-2xx (so callers can surface it)", async () => {
    process.env.RESEND_API_KEY = "re_test"
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 422 }))
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(
      /Resend send failed \(422\)/,
    )
  })
})
