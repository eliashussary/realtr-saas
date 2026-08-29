import type { ConnectionResult, CrmContext, CrmProvider, Lead, PushResult } from "./types"

// Follow Up Boss — first CRM integration. https://docs.followupboss.com/reference
// Auth is HTTP Basic with the API key as the username and an empty password.

const BASE = "https://api.followupboss.com/v1"

function apiKey(config: Record<string, unknown>): string {
  const key = config.apiKey
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Follow Up Boss API key is missing")
  }
  return key.trim()
}

function authHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`
}

function splitName(name: string | undefined): { firstName: string; lastName?: string } {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return { firstName: "Website" }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] as string }
  return { firstName: parts[0] as string, lastName: parts.slice(1).join(" ") }
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text ? `: ${text.slice(0, 200)}` : ""
  } catch {
    return ""
  }
}

export const followUpBoss: CrmProvider = {
  provider: "fub",

  async testConnection(ctx: CrmContext): Promise<ConnectionResult> {
    const fetchImpl = ctx.fetchImpl ?? fetch
    try {
      const res = await fetchImpl(`${BASE}/identity`, {
        headers: { Authorization: authHeader(apiKey(ctx.config)), Accept: "application/json" },
      })
      return res.ok ? { ok: true } : { ok: false, error: `Follow Up Boss returned ${res.status}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  },

  async pushLead(ctx: CrmContext, lead: Lead): Promise<PushResult> {
    const fetchImpl = ctx.fetchImpl ?? fetch
    const { firstName, lastName } = splitName(lead.name)
    const body = {
      source: "Realtr",
      system: "Realtr",
      type: "General Inquiry",
      message: lead.message ?? "",
      person: {
        firstName,
        lastName,
        emails: lead.email ? [{ value: lead.email }] : undefined,
        phones: lead.phone ? [{ value: lead.phone }] : undefined,
      },
    }
    const res = await fetchImpl(`${BASE}/events`, {
      method: "POST",
      headers: {
        Authorization: authHeader(apiKey(ctx.config)),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Follow Up Boss ${res.status}${await safeErrorText(res)}`)
    const data = (await res.json().catch(() => ({}))) as {
      id?: number | string
      person?: { id?: number | string }
    }
    const externalId = data.person?.id ?? data.id
    return { externalId: externalId != null ? String(externalId) : undefined }
  },
}
