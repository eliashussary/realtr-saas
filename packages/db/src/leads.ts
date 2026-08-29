import { and, desc, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { lead } from "./schema"
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
