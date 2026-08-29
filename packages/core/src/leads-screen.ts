// Pure, DB-free lead screening: honeypot, field cleaning, contact validation, and an in-memory rate
// limiter. Kept separate from leads.ts so this logic is unit-testable without importing @realtr/db.

export interface CaptureLeadInput {
  host: string
  source?: string
  name?: string
  email?: string
  phone?: string
  message?: string
  consent?: boolean
  /** Public `sourceListingId` for a listing inquiry; resolved to the canonical listing on capture. */
  listingRef?: string | null
  pagePath?: string | null
  /** Honeypot: a hidden field real users leave empty. Non-empty = bot; silently dropped. */
  trap?: string
  /** Client IP for rate limiting; from x-forwarded-for at the edge. */
  ip?: string
}

export interface CleanedLead {
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
}

export type ScreenResult =
  | { ok: true; fields: CleanedLead }
  | { ok: false; status: "dropped" }
  | { ok: false; status: "invalid"; reason: string }

const MAX = { name: 200, email: 320, phone: 40, message: 4000 }

export function clean(value: string | undefined | null, max: number): string | null {
  if (!value) return null
  const trimmed = value.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Honeypot, field cleaning, and contact validation. A lead needs at least one contact channel and a
 * syntactically valid email if one is given.
 */
export function screenLead(input: CaptureLeadInput): ScreenResult {
  if (input.trap && input.trap.trim().length > 0) return { ok: false, status: "dropped" }
  const fields: CleanedLead = {
    name: clean(input.name, MAX.name),
    email: clean(input.email, MAX.email),
    phone: clean(input.phone, MAX.phone),
    message: clean(input.message, MAX.message),
  }
  if (!fields.email && !fields.phone) {
    return { ok: false, status: "invalid", reason: "contact_required" }
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return { ok: false, status: "invalid", reason: "email_invalid" }
  }
  return { ok: true, fields }
}

// ponytail: in-memory fixed-window rate limit, per process. Fine for single-host MVP; move to a
// shared store (Redis) if the renderer scales horizontally.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const hits = new Map<string, { count: number; resetAt: number }>()

export function rateLimited(key: string, now: number): boolean {
  const entry = hits.get(key)
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}
