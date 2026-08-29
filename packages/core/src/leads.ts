import { db } from "@realtr/db"
import { createLead } from "@realtr/db/leads"
import { type CaptureLeadInput, clean, rateLimited, screenLead } from "./leads-screen"
import { resolvePublishedSite } from "./published"

// Lead capture (M4). Store-before-deliver: a validated inquiry is durably persisted here before any
// CRM delivery is attempted (delivery is a later slice). Host resolves to the tenant so a public
// form never needs to carry an org id. Pure screening lives in leads-screen.ts.

export type { CaptureLeadInput } from "./leads-screen"

export type CaptureLeadResult =
  | { status: "ok"; leadId: string }
  | { status: "dropped" } // honeypot/rate-limit — look like success to the bot, store nothing
  | { status: "invalid"; reason: string }
  | { status: "not_found" }
  | { status: "error" }

export async function captureLead(input: CaptureLeadInput): Promise<CaptureLeadResult> {
  const screened = screenLead(input)
  // Honeypot pretends success, persists nothing; invalid short-circuits before touching the DB.
  if (!screened.ok) return screened

  const site = await resolvePublishedSite(input.host)
  if (site.status === "error") return { status: "error" }
  if (site.status !== "ok") return { status: "not_found" }

  const rlKey = `${site.organizationId}:${input.ip ?? "unknown"}`
  if (rateLimited(rlKey, Date.now())) return { status: "dropped" }

  // Listing inquiry: link the canonical listing and route to its agent. A stale/unknown ref never
  // blocks capture — the inquiry is still stored, just unlinked.
  let listingId: string | null = null
  let assignedMemberId: string | null = null
  const ref = clean(input.listingRef, 200)
  if (ref) {
    const { resolveListingRef } = await import("@realtr/db/listings")
    const resolved = await resolveListingRef(db, site.organizationId, ref)
    if (resolved) {
      listingId = resolved.id
      assignedMemberId = resolved.memberId // null for DDF listings → stays in the owner pool
    }
  }

  try {
    const leadId = await createLead(db, {
      organizationId: site.organizationId,
      siteId: site.siteId,
      listingId,
      assignedMemberId,
      source: input.source ?? "contact_form",
      ...screened.fields,
      consent: input.consent ?? false,
      pagePath: clean(input.pagePath, 500),
    })
    return { status: "ok", leadId }
  } catch {
    return { status: "error" }
  }
}
