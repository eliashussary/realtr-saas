import { describe, expect, it, vi } from "vitest"
import { DdfAuthError, DdfClient, DdfRequestError } from "./client"
import { HOST, TOKEN_ENDPOINT, property, replicationRow, tokenBody } from "./fixtures/synthetic"

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

const noopSleep = () => Promise.resolve()

/** A fetch stub that dispatches by method+url through a caller-supplied handler. */
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  )
}

async function authedClient(fetchImpl: ReturnType<typeof stubFetch>, over = {}) {
  const client = new DdfClient({
    host: HOST,
    tokenEndpoint: TOKEN_ENDPOINT,
    fetch: fetchImpl as unknown as typeof fetch,
    sleep: noopSleep,
    ...over,
  })
  await client.authenticate("client-id", "client-secret")
  return client
}

describe("DdfClient auth", () => {
  it("exchanges client credentials and sends a bearer token", async () => {
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      return json({ value: [property("A")] })
    })
    const client = await authedClient(fetchImpl)
    await client.getPropertyPage()

    const tokenCall = fetchImpl.mock.calls.find(([u]) => u === TOKEN_ENDPOINT)
    expect(String(tokenCall?.[1]?.body)).toContain("grant_type=client_credentials")
    const apiCall = fetchImpl.mock.calls.find(([u]) => String(u).includes("/odata/v1/Property"))
    expect((apiCall?.[1]?.headers as Record<string, string>).authorization).toBe(
      "Bearer synthetic-access-token",
    )
  })

  it("throws DdfAuthError on a failed token exchange", async () => {
    const fetchImpl = stubFetch(() => json({ error: "invalid_client" }, { status: 401 }))
    const client = new DdfClient({
      host: HOST,
      tokenEndpoint: TOKEN_ENDPOINT,
      fetch: fetchImpl as unknown as typeof fetch,
      sleep: noopSleep,
    })
    await expect(client.authenticate("bad", "creds")).rejects.toBeInstanceOf(DdfAuthError)
  })

  it("refreshes the token once it is within the skew window", async () => {
    let clock = 1_000_000
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json({ ...tokenBody, expires_in: 100 })
      return json({ value: [property("A")] })
    })
    const client = await authedClient(fetchImpl, { now: () => clock, tokenRefreshSkewMs: 0 })
    await client.getPropertyPage() // within validity — no refresh
    clock += 200_000 // past expiry
    await client.getPropertyPage() // triggers refresh

    const tokenCalls = fetchImpl.mock.calls.filter(([u]) => u === TOKEN_ENDPOINT)
    expect(tokenCalls).toHaveLength(2)
  })
})

describe("DdfClient pagination", () => {
  it("follows @odata.nextLink and dedupes rows by ListingKey", async () => {
    const next = `${HOST}/odata/v1/Property?$skip=2`
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      if (url === next) return json({ value: [property("B"), property("C")] }) // B duplicated
      return json({ value: [property("A"), property("B")], "@odata.nextLink": next })
    })
    const client = await authedClient(fetchImpl)
    const all = await client.collectProperties()

    expect(all.map((p) => p.ListingKey).sort()).toEqual(["A", "B", "C"])
  })

  it("sends a delta filter and deterministic ordering", async () => {
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      return json({ value: [] })
    })
    const client = await authedClient(fetchImpl)
    await client.getPropertyPage({ since: new Date("2026-02-01T00:00:00.000Z") })

    const apiUrl = String(fetchImpl.mock.calls.find(([u]) => String(u).includes("/Property"))?.[0])
    const decoded = decodeURIComponent(apiUrl)
    expect(decoded).toContain("ModificationTimestamp gt 2026-02-01T00:00:00.000Z")
    expect(decoded).toContain("$orderby=ModificationTimestamp,ListingKey")
    expect(decoded).toContain("$top=100")
  })

  it("collects the replication master list", async () => {
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      return json({ value: [replicationRow("A"), replicationRow("B")] })
    })
    const client = await authedClient(fetchImpl)
    const rows = await client.collectReplication()
    expect(rows.map((r) => r.ListingKey)).toEqual(["A", "B"])
  })
})

describe("DdfClient retries", () => {
  it("retries a 429 then succeeds", async () => {
    let apiCalls = 0
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      apiCalls++
      if (apiCalls === 1) return json({ error: "slow down" }, { status: 429 })
      return json({ value: [property("A")] })
    })
    const client = await authedClient(fetchImpl)
    const page = await client.getPropertyPage()

    expect(apiCalls).toBe(2)
    expect(page.value).toHaveLength(1)
  })

  it("throws DdfRequestError on a non-retryable status", async () => {
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      return json({ error: "forbidden" }, { status: 403 })
    })
    const client = await authedClient(fetchImpl)
    await expect(client.getPropertyPage()).rejects.toBeInstanceOf(DdfRequestError)
  })

  it("gives up after maxRetries on persistent 503s", async () => {
    let apiCalls = 0
    const fetchImpl = stubFetch((url) => {
      if (url === TOKEN_ENDPOINT) return json(tokenBody)
      apiCalls++
      return json({ error: "unavailable" }, { status: 503 })
    })
    const client = await authedClient(fetchImpl, { maxRetries: 2 })
    await expect(client.getPropertyPage()).rejects.toBeInstanceOf(DdfRequestError)
    expect(apiCalls).toBe(3) // initial + 2 retries
  })
})
