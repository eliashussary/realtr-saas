import { db } from "@realtr/db"
import {
  claimLeadNotification,
  leadNotificationRecipients,
  listUnprocessedLeads,
  setLeadDelivery,
} from "@realtr/db/leads"
import { sendEmail } from "./email"
import { loadConnectedCrm } from "./integrations/config"
import { getCrm } from "./integrations/crm"

// Worker-side lead fan-out (M4). Store-before-deliver: capture only persists; this sweep notifies
// the realtor and delivers to the connected CRM, marking per-lead status so failures are visible in
// the inbox and retryable. Idempotent via notifiedAt / deliveryStatus guards.
// ponytail: polled by a 1-minute worker cron (≤60s latency). Move to event-driven enqueue if
// instant delivery matters.

type LeadRow = Awaited<ReturnType<typeof listUnprocessedLeads>>[number]

function contactLabel(lead: LeadRow): string {
  return lead.name ?? lead.email ?? lead.phone ?? "New lead"
}

async function notify(lead: LeadRow, log: (m: string) => void): Promise<void> {
  if (lead.notifiedAt) return
  // Claim first so two concurrent sweeps can't double-send.
  if (!(await claimLeadNotification(db, lead.id))) return
  const recipients = await leadNotificationRecipients(
    db,
    lead.organizationId,
    lead.assignedMemberId,
  )
  if (recipients.length === 0) return
  const lines = [
    `New ${lead.source === "listing_inquiry" ? "listing inquiry" : "inquiry"} from ${contactLabel(lead)}.`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.message ? `\n${lead.message}` : null,
  ].filter(Boolean)
  // Best-effort: the lead is already stored and separately delivered to the CRM, so a transient email
  // failure must not crash the sweep. The claim above makes this at-most-once.
  try {
    await sendEmail({
      to: recipients,
      subject: `New lead: ${contactLabel(lead)}`,
      text: lines.join("\n"),
    })
    log(`[leads] notified ${recipients.length} recipient(s) for lead ${lead.id}`)
  } catch (error) {
    const { reportError } = await import("./log")
    reportError(error, { component: "leads", action: "notify", leadId: lead.id })
  }
}

async function deliver(lead: LeadRow, log: (m: string) => void): Promise<void> {
  if (lead.deliveryStatus !== "pending") return
  const crm = await loadConnectedCrm(lead.organizationId)
  if (!crm) {
    await setLeadDelivery(db, lead.id, { status: "skipped" })
    return
  }
  const provider = getCrm(crm.provider)
  if (!provider) {
    await setLeadDelivery(db, lead.id, { status: "skipped", error: `Unknown CRM ${crm.provider}` })
    return
  }
  try {
    const result = await provider.pushLead(
      { config: crm.config, organizationId: lead.organizationId },
      {
        name: lead.name ?? undefined,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        message: lead.message ?? undefined,
        source: lead.source,
      },
    )
    await setLeadDelivery(db, lead.id, { status: "delivered", externalId: result.externalId })
    log(`[leads] delivered lead ${lead.id} to ${crm.provider}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery failed"
    // Lead is retained; marked failed and retryable from the inbox.
    await setLeadDelivery(db, lead.id, { status: "failed", error: message.slice(0, 300) })
    log(`[leads] delivery failed for lead ${lead.id}: ${message}`)
  }
}

/** Process one batch of unprocessed leads: notify then deliver. Safe to run concurrently. */
export async function runLeadDelivery(
  options: { limit?: number; log?: (m: string) => void } = {},
): Promise<{ processed: number }> {
  const log = options.log ?? (() => {})
  const leads = await listUnprocessedLeads(db, options.limit ?? 50)
  for (const lead of leads) {
    // Guard each lead so one failure never aborts the batch (delivery already retains failures).
    try {
      await notify(lead, log)
      await deliver(lead, log)
    } catch (error) {
      const { reportError } = await import("./log")
      reportError(error, { component: "leads", action: "runLeadDelivery", leadId: lead.id })
    }
  }
  return { processed: leads.length }
}
