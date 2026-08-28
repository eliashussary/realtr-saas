import { z } from "zod"
import { type PropertyQueryOptions, buildPropertyQuery, buildReplicationQuery } from "./query"
import type {
  DdfProperty,
  DdfPropertyResponse,
  DdfReplicationResponse,
  DdfReplicationRow,
  ODataResponse,
} from "./types"

const DEFAULT_HOST = "https://ddfapi.realtor.ca"
const DEFAULT_TOKEN_ENDPOINT = "https://identity.crea.ca/connect/token"
const PROPERTY_PATH = "/odata/v1/Property"
const REPLICATION_PATH = "/odata/v1/Property/PropertyReplication"
const DDF_SCOPE = "DDFApi_Read"

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().positive(),
})

export interface DdfClientOptions {
  host?: string
  tokenEndpoint?: string
  /** Injected for testing; defaults to global fetch. */
  fetch?: typeof fetch
  /** Injected clock (ms since epoch); defaults to Date.now. */
  now?: () => number
  /** Injected backoff sleeper; defaults to real setTimeout. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>
  /** Max retry attempts for transient failures (429/5xx/408/network). Default 4. */
  maxRetries?: number
  /** Refresh the token this many ms before it actually expires. Default 60s. */
  tokenRefreshSkewMs?: number
}

interface StoredToken {
  authorization: string
  expiresAt: number
}

export class DdfAuthError extends Error {}
export class DdfRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * RESO Web API (OData) client for the REALTOR.ca DDF feed. Handles OAuth2 client-credentials auth
 * with pre-expiry refresh, deterministic paginated reads via `@odata.nextLink`, replication reads,
 * and retry/backoff for transient failures. All I/O is injectable so the client is fully testable
 * against synthetic fixtures with no network.
 */
export class DdfClient {
  readonly #host: string
  readonly #tokenEndpoint: string
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #sleep: (ms: number) => Promise<void>
  readonly #maxRetries: number
  readonly #skewMs: number

  #credentials: { clientId: string; clientSecret: string } | null = null
  #token: StoredToken | null = null

  constructor(options: DdfClientOptions = {}) {
    this.#host = options.host ?? DEFAULT_HOST
    this.#tokenEndpoint = options.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? Date.now
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.#maxRetries = options.maxRetries ?? 4
    this.#skewMs = options.tokenRefreshSkewMs ?? 60_000
  }

  /** Store client credentials and fetch an initial token. Throws DdfAuthError on failure. */
  async authenticate(clientId: string, clientSecret: string): Promise<void> {
    this.#credentials = { clientId, clientSecret }
    await this.#refreshToken()
  }

  async #refreshToken(): Promise<void> {
    if (!this.#credentials) throw new DdfAuthError("DDF client is not authenticated")
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.#credentials.clientId,
      client_secret: this.#credentials.clientSecret,
      scope: DDF_SCOPE,
    })
    let response: Response
    try {
      response = await this.#fetch(this.#tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
    } catch (error) {
      throw new DdfAuthError(
        `DDF token request failed: ${error instanceof Error ? error.message : "network error"}`,
      )
    }
    if (!response.ok) {
      throw new DdfAuthError(`DDF token request failed with status ${response.status}`)
    }
    const parsed = tokenResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new DdfAuthError("DDF token response was malformed")
    this.#token = {
      authorization: `${parsed.data.token_type} ${parsed.data.access_token}`,
      expiresAt: this.#now() + parsed.data.expires_in * 1000,
    }
  }

  async #authorization(): Promise<string> {
    if (!this.#token || this.#now() >= this.#token.expiresAt - this.#skewMs) {
      await this.#refreshToken()
    }
    return this.#token!.authorization
  }

  #backoffMs(attempt: number): number {
    const base = Math.min(30_000, 500 * 2 ** attempt)
    return base + Math.floor(Math.random() * 250)
  }

  /** GET an absolute URL with auth + retry/backoff for transient failures. */
  async #get<T>(url: string): Promise<T> {
    let attempt = 0
    for (;;) {
      const authorization = await this.#authorization()
      let response: Response
      try {
        response = await this.#fetch(url, {
          headers: { authorization, accept: "application/json" },
        })
      } catch (error) {
        if (attempt >= this.#maxRetries) {
          throw new DdfRequestError(
            `DDF request failed: ${error instanceof Error ? error.message : "network error"}`,
            0,
          )
        }
        await this.#sleep(this.#backoffMs(attempt))
        attempt++
        continue
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < this.#maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"))
        await this.#sleep(retryAfter ?? this.#backoffMs(attempt))
        attempt++
        continue
      }
      if (!response.ok) {
        throw new DdfRequestError(
          `DDF request failed with status ${response.status}`,
          response.status,
        )
      }
      return (await response.json()) as T
    }
  }

  #url(path: string, query: string): string {
    return query ? `${this.#host}${path}?${query}` : `${this.#host}${path}`
  }

  /** Fetch a single page of Property records. */
  getPropertyPage(options: PropertyQueryOptions = {}): Promise<DdfPropertyResponse> {
    return this.#get<DdfPropertyResponse>(this.#url(PROPERTY_PATH, buildPropertyQuery(options)))
  }

  /** Fetch a single page of PropertyReplication rows (key + modification timestamp). */
  getReplicationPage(
    options: { since?: Date; top?: number } = {},
  ): Promise<DdfReplicationResponse> {
    return this.#get<DdfReplicationResponse>(
      this.#url(REPLICATION_PATH, buildReplicationQuery(options)),
    )
  }

  /** Follow `@odata.nextLink` from a first response, yielding each page's `value` array. */
  async *paginate<T>(first: ODataResponse<T>): AsyncGenerator<T[]> {
    let page: ODataResponse<T> | undefined = first
    while (page) {
      yield page.value
      const next: string | null | undefined = page["@odata.nextLink"]
      page = next ? await this.#get<ODataResponse<T>>(next) : undefined
    }
  }

  /** Read every Property page and return records deduped by ListingKey (pages may repeat rows). */
  async collectProperties(options: PropertyQueryOptions = {}): Promise<DdfProperty[]> {
    const first = await this.getPropertyPage(options)
    const byKey = new Map<string, DdfProperty>()
    for await (const rows of this.paginate(first)) {
      for (const row of rows) byKey.set(row.ListingKey, row)
    }
    return [...byKey.values()]
  }

  /** Read the full replication master list, deduped by ListingKey. */
  async collectReplication(
    options: { since?: Date; top?: number } = {},
  ): Promise<DdfReplicationRow[]> {
    const first = await this.getReplicationPage(options)
    const byKey = new Map<string, DdfReplicationRow>()
    for await (const rows of this.paginate(first)) {
      for (const row of rows) byKey.set(row.ListingKey, row)
    }
    return [...byKey.values()]
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
