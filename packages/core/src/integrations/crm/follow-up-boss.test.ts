import { describe, expect, it, vi } from "vitest"
import { followUpBoss } from "./follow-up-boss"

const config = { apiKey: "test-key" }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("followUpBoss.pushLead", () => {
  it("POSTs an event with Basic auth and split name, returning the person id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 55, person: { id: 900 } }, 201))
    const result = await followUpBoss.pushLead(
      { config, organizationId: "org", fetchImpl: fetchImpl as unknown as typeof fetch },
      { name: "Jane Q Buyer", email: "jane@example.com", phone: "555", message: "hi" },
    )
    expect(result.externalId).toBe("900")

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.followupboss.com/v1/events")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    // Basic base64("test-key:")
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("test-key:").toString("base64")}`)
    const body = JSON.parse(init.body as string)
    expect(body.person.firstName).toBe("Jane")
    expect(body.person.lastName).toBe("Q Buyer")
    expect(body.person.emails).toEqual([{ value: "jane@example.com" }])
    expect(body.person.phones).toEqual([{ value: "555" }])
    expect(body.type).toBe("General Inquiry")
  })

  it("throws on a non-ok response so the caller can retry", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }))
    await expect(
      followUpBoss.pushLead(
        { config, organizationId: "org", fetchImpl: fetchImpl as unknown as typeof fetch },
        { email: "x@y.co" },
      ),
    ).rejects.toThrow(/Follow Up Boss 401/)
  })

  it("throws when the API key is missing", async () => {
    await expect(
      followUpBoss.pushLead({ config: {}, organizationId: "org" }, { email: "x@y.co" }),
    ).rejects.toThrow(/API key is missing/)
  })
})

describe("followUpBoss.testConnection", () => {
  it("reports ok on a 200 from /identity", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ name: "Acme" }))
    const res = await followUpBoss.testConnection({
      config,
      organizationId: "org",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.ok).toBe(true)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.followupboss.com/v1/identity",
    )
  })

  it("reports the status on failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }))
    const res = await followUpBoss.testConnection({
      config,
      organizationId: "org",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res).toEqual({ ok: false, error: "Follow Up Boss returned 403" })
  })
})
