import { and, desc, eq, isNull, or } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { lead, member, user } from "./schema"
import type * as schema from "./schema"

// Minimal lead repository — the M4 seam. Store-before-deliver and per-agent assignment are modeled
// here; capture forms, inbox, distribution rules, and pipeline are a later milestone.
export type LeadDatabase = NodePgDatabase<typeof schema>

export interface CreateLeadInput {
  organizationId: string
  assignedMemberId?: string | null
  siteId?: string | null
  listingId?: string | null
  source?: string
  name?: string | null
  email?: string | null
  phone?: string | null
  message?: string | null
  consent?: boolean
  pagePath?: string | null
}

export async function createLead(database: LeadDatabase, input: CreateLeadInput): Promise<string> {
  const [row] = await database
    .insert(lead)
    .values({
      organizationId: input.organizationId,
      assignedMemberId: input.assignedMemberId ?? null,
      siteId: input.siteId ?? null,
      listingId: input.listingId ?? null,
      source: input.source ?? "contact_form",
      name: input.name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      message: input.message ?? null,
      consent: input.consent ?? false,
      pagePath: input.pagePath ?? null,
    })
    .returning({ id: lead.id })
  if (!row) throw new Error("Failed to create lead")
  return row.id
}

export async function listLeadsForOrg(
  database: LeadDatabase,
  organizationId: string,
  options: { assignedMemberId?: string; status?: string; limit?: number } = {},
) {
  const conditions = [eq(lead.organizationId, organizationId)]
  if (options.assignedMemberId) conditions.push(eq(lead.assignedMemberId, options.assignedMemberId))
  if (options.status) conditions.push(eq(lead.status, options.status))
  return database
    .select()
    .from(lead)
    .where(and(...conditions))
    .orderBy(desc(lead.createdAt))
    .limit(options.limit ?? 200)
}

/** Distribution hook: assign (or clear) a lead's owning agent. */
export async function assignLead(
  database: LeadDatabase,
  organizationId: string,
  id: string,
  assignedMemberId: string | null,
): Promise<number> {
  const result = await database
    .update(lead)
    .set({ assignedMemberId, updatedAt: new Date() })
    .where(and(eq(lead.organizationId, organizationId), eq(lead.id, id)))
  return result.rowCount ?? 0
}

// ── Delivery + notification (M4 worker sweep) ─────────────────────────────────────────────────

/** Leads still needing notification (notifiedAt null) or CRM delivery (deliveryStatus pending). */
export async function listUnprocessedLeads(database: LeadDatabase, limit = 50) {
  return database
    .select()
    .from(lead)
    .where(or(isNull(lead.notifiedAt), eq(lead.deliveryStatus, "pending")))
    .orderBy(lead.createdAt)
    .limit(limit)
}

/** Claim a lead for notification: sets notifiedAt only if unset. rowCount 1 = this caller won. */
export async function claimLeadNotification(database: LeadDatabase, id: string): Promise<boolean> {
  const result = await database
    .update(lead)
    .set({ notifiedAt: new Date() })
    .where(and(eq(lead.id, id), isNull(lead.notifiedAt)))
  return (result.rowCount ?? 0) > 0
}

export interface DeliveryUpdate {
  status: "delivered" | "failed" | "skipped"
  externalId?: string | null
  error?: string | null
}

export async function setLeadDelivery(
  database: LeadDatabase,
  id: string,
  update: DeliveryUpdate,
): Promise<void> {
  await database
    .update(lead)
    .set({
      deliveryStatus: update.status,
      deliveredAt: update.status === "delivered" ? new Date() : null,
      crmExternalId: update.externalId ?? null,
      deliveryError: update.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(lead.id, id))
}

/** Re-queue a failed delivery (owner/admin action). Only 'failed' leads can be retried. */
export async function retryLeadDelivery(
  database: LeadDatabase,
  organizationId: string,
  id: string,
): Promise<number> {
  const result = await database
    .update(lead)
    .set({ deliveryStatus: "pending", deliveryError: null, updatedAt: new Date() })
    .where(
      and(
        eq(lead.organizationId, organizationId),
        eq(lead.id, id),
        eq(lead.deliveryStatus, "failed"),
      ),
    )
  return result.rowCount ?? 0
}

/** Re-queue every failed delivery for a tenant (super-admin bulk retry). Returns the count re-queued. */
export async function retryFailedDeliveriesForOrg(
  database: LeadDatabase,
  organizationId: string,
): Promise<number> {
  const result = await database
    .update(lead)
    .set({ deliveryStatus: "pending", deliveryError: null, updatedAt: new Date() })
    .where(and(eq(lead.organizationId, organizationId), eq(lead.deliveryStatus, "failed")))
  return result.rowCount ?? 0
}

/** Emails to notify about a new lead: the org owner plus the assigned agent (if any), deduped. */
export async function leadNotificationRecipients(
  database: LeadDatabase,
  organizationId: string,
  assignedMemberId: string | null,
): Promise<string[]> {
  const rows = await database
    .select({ email: user.email, role: member.role, memberId: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
  const emails = new Set<string>()
  for (const r of rows) {
    if (r.role === "owner") emails.add(r.email)
    if (assignedMemberId && r.memberId === assignedMemberId) emails.add(r.email)
  }
  return [...emails]
}

// new -> working -> outcome. Kept as a constant so the UI and repo agree on the vocabulary.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/**
 * Move a lead through its pipeline. `restrictToMemberId` scopes the write to a single owning agent
 * (rowCount 0 if the lead isn't theirs) so agent-role callers can only touch their own leads.
 */
export async function updateLeadStatus(
  database: LeadDatabase,
  organizationId: string,
  id: string,
  status: LeadStatus,
  restrictToMemberId: string | null = null,
): Promise<number> {
  const conditions = [eq(lead.organizationId, organizationId), eq(lead.id, id)]
  if (restrictToMemberId) conditions.push(eq(lead.assignedMemberId, restrictToMemberId))
  const result = await database
    .update(lead)
    .set({ status, updatedAt: new Date() })
    .where(and(...conditions))
  return result.rowCount ?? 0
}
