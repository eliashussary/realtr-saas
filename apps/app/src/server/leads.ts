import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// @realtr/db pulls in server-only code (pg → Buffer). These server functions are imported by a
// client route component, so all @realtr/db imports stay dynamic and inside handlers — the same
// convention as server/listings.ts — to keep them out of the browser bundle.

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const

export interface LeadListItem {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  source: string
  status: string
  pagePath: string | null
  assignedMemberId: string | null
  deliveryStatus: string
  createdAt: string
}

export interface AssignableMember {
  memberId: string
  label: string
}

/** Org roster (memberId + display label) for the assignment picker. */
async function orgMembers(organizationId: string): Promise<AssignableMember[]> {
  const { db, eq, asc, member, user } = await import("@realtr/db")
  const { agentProfile } = await import("@realtr/db/schema")
  const rows = await db
    .select({
      memberId: member.id,
      name: user.name,
      email: user.email,
      displayName: agentProfile.displayName,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(agentProfile, eq(agentProfile.memberId, member.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt))
  return rows.map((r) => ({
    memberId: r.memberId,
    label: r.displayName ?? r.name ?? r.email ?? "Member",
  }))
}

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

const listQueryInput = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
})

/** Tenant-scoped lead inbox. Admins see all leads; agents see only leads assigned to them. */
export const listLeadsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listQueryInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const role = authorization.role
    const canViewAll = can(role, "lead", "viewAll")

    const canAssign = can(role, "lead", "assign")
    const { db } = await import("@realtr/db")
    const { listLeadsForOrg } = await import("@realtr/db/leads")
    const rows = await listLeadsForOrg(db, authorization.organizationId, {
      // Agents without viewAll are scoped to their own assigned leads at the query level.
      assignedMemberId: canViewAll ? undefined : authorization.memberId,
      status: data.status,
    })
    // Only assigners need the roster (for the picker).
    const members = canAssign ? await orgMembers(authorization.organizationId) : []
    const items: LeadListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      message: r.message,
      source: r.source,
      status: r.status,
      pagePath: r.pagePath,
      assignedMemberId: r.assignedMemberId,
      deliveryStatus: r.deliveryStatus,
      createdAt: r.createdAt.toISOString(),
    }))
    return {
      ok: true as const,
      canUpdate: can(role, "lead", "update"),
      canAssign,
      canViewAll,
      memberId: authorization.memberId,
      members,
      items,
    }
  })

const updateStatusInput = z.object({
  leadId: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
})

/** Move a lead through its pipeline. Agents may only update their own assigned leads. */
export const updateLeadStatusFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateStatusInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "lead", "update")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { db } = await import("@realtr/db")
    const { updateLeadStatus } = await import("@realtr/db/leads")
    const restrictToMemberId = can(authorization.role, "lead", "viewAll")
      ? null
      : authorization.memberId
    const changed = await updateLeadStatus(
      db,
      authorization.organizationId,
      data.leadId,
      data.status,
      restrictToMemberId,
    )
    // rowCount 0 = not this tenant's lead, or not this agent's lead. Don't disclose which.
    if (changed === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })

const assignInput = z.object({
  leadId: z.string().uuid(),
  assignedMemberId: z.string().min(1).nullable(),
})

/** Reassign (or clear) a lead's owning agent. Owner/admin only; target must be in the org. */
export const assignLeadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => assignInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "lead", "assign")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { db, and, eq, member } = await import("@realtr/db")
    // The target member must belong to this org — never let an assignment point across tenants.
    if (data.assignedMemberId) {
      const [m] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.id, data.assignedMemberId),
            eq(member.organizationId, authorization.organizationId),
          ),
        )
        .limit(1)
      if (!m) return { ok: false as const, code: "not_found" as const }
    }
    const { assignLead } = await import("@realtr/db/leads")
    const changed = await assignLead(
      db,
      authorization.organizationId,
      data.leadId,
      data.assignedMemberId,
    )
    if (changed === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })

const retryInput = z.object({ leadId: z.string().uuid() })

/** Re-queue a failed CRM delivery. Owner/admin only; the worker picks it up on its next sweep. */
export const retryLeadDeliveryFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => retryInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "lead", "assign")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { db } = await import("@realtr/db")
    const { retryLeadDelivery } = await import("@realtr/db/leads")
    const changed = await retryLeadDelivery(db, authorization.organizationId, data.leadId)
    if (changed === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })
