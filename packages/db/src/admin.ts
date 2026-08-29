import { and, desc, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import {
  domain,
  adminAuditEvent,
  integration,
  lead,
  listing,
  listingSyncRun,
  member,
  organization,
  site,
  subscription,
} from "./schema"
import type * as schema from "./schema"

// Read + audit layer for the super-admin operations console (M7-A1). All cross-tenant; only reached
// from super-admin-guarded server functions.
export type AdminDatabase = NodePgDatabase<typeof schema>

// --- Audit trail ---

export async function recordAdminAudit(
  database: AdminDatabase,
  input: {
    actorEmail: string
    action: string
    targetOrganizationId?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await database.insert(adminAuditEvent).values({
    actorEmail: input.actorEmail,
    action: input.action,
    targetOrganizationId: input.targetOrganizationId ?? null,
    detail: input.detail ?? {},
  })
}

export interface AdminAuditRow {
  id: string
  actorEmail: string
  action: string
  targetOrganizationId: string | null
  organizationName: string | null
  detail: Record<string, unknown>
  createdAt: Date
}

export async function listAdminAudit(
  database: AdminDatabase,
  limit = 100,
): Promise<AdminAuditRow[]> {
  return database
    .select({
      id: adminAuditEvent.id,
      actorEmail: adminAuditEvent.actorEmail,
      action: adminAuditEvent.action,
      targetOrganizationId: adminAuditEvent.targetOrganizationId,
      organizationName: organization.name,
      detail: adminAuditEvent.detail,
      createdAt: adminAuditEvent.createdAt,
    })
    .from(adminAuditEvent)
    .leftJoin(organization, eq(organization.id, adminAuditEvent.targetOrganizationId))
    .orderBy(desc(adminAuditEvent.createdAt))
    .limit(limit)
}

// --- Tenant health board ---

export interface TenantHealthRow {
  organizationId: string
  organizationName: string
  createdAt: Date
  subscriptionStatus: string
  planId: string | null
  memberCount: number
  domainCount: number
  /** The least-healthy domain status across the tenant's domains (for an at-a-glance flag). */
  domainWorstStatus: string | null
  ddfConnected: boolean
  crmConnected: boolean
  activeListings: number
  leadCount: number
  undeliveredLeads: number
  lastSyncAt: Date | null
  lastSyncStatus: string | null
}

// Domain lifecycle ordered worst→best, so the board can surface the status most in need of attention.
const DOMAIN_STATUS_RANK: Record<string, number> = {
  error: 0,
  pending: 1,
  verifying: 2,
  detached: 3,
  verified: 4,
  active: 5,
}

/**
 * One consolidated health row per organization. Deliberately a handful of small scoped queries per
 * org rather than one giant join — the operator cohort is small (pilot), and this keeps each figure
 * obvious and correct. Revisit with a single aggregated query if tenant counts grow large.
 */
export async function listTenantHealth(database: AdminDatabase): Promise<TenantHealthRow[]> {
  const orgs = await database
    .select({ id: organization.id, name: organization.name, createdAt: organization.createdAt })
    .from(organization)
    .orderBy(organization.name)

  const rows: TenantHealthRow[] = []
  for (const org of orgs) {
    const [{ value: memberCount } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(member)
      .where(eq(member.organizationId, org.id))

    const domains = await database
      .select({ status: domain.status })
      .from(domain)
      .innerJoin(site, eq(site.id, domain.siteId))
      .where(eq(site.organizationId, org.id))

    let domainWorstStatus: string | null = null
    for (const d of domains) {
      if (
        domainWorstStatus === null ||
        (DOMAIN_STATUS_RANK[d.status] ?? 9) < (DOMAIN_STATUS_RANK[domainWorstStatus] ?? 9)
      ) {
        domainWorstStatus = d.status
      }
    }

    const integrations = await database
      .select({ kind: integration.kind, status: integration.status })
      .from(integration)
      .where(eq(integration.organizationId, org.id))

    const [{ value: activeListings } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(listing)
      .where(and(eq(listing.organizationId, org.id), eq(listing.status, "active")))

    const [leadCounts = { total: 0, undelivered: 0 }] = await database
      .select({
        total: sql<number>`count(*)::int`,
        undelivered: sql<number>`count(*) filter (where ${lead.deliveryStatus} in ('pending','failed'))::int`,
      })
      .from(lead)
      .where(eq(lead.organizationId, org.id))

    const [lastRun] = await database
      .select({ status: listingSyncRun.status, finishedAt: listingSyncRun.finishedAt })
      .from(listingSyncRun)
      .where(eq(listingSyncRun.organizationId, org.id))
      .orderBy(desc(listingSyncRun.createdAt))
      .limit(1)

    const [sub] = await database
      .select({ status: subscription.status, planId: subscription.planId })
      .from(subscription)
      .where(eq(subscription.organizationId, org.id))
      .limit(1)

    rows.push({
      organizationId: org.id,
      organizationName: org.name,
      createdAt: org.createdAt,
      subscriptionStatus: sub?.status ?? "none",
      planId: sub?.planId ?? null,
      memberCount,
      domainCount: domains.length,
      domainWorstStatus,
      ddfConnected: integrations.some(
        (i) => i.kind === "listing_source" && i.status === "connected",
      ),
      crmConnected: integrations.some((i) => i.kind === "crm" && i.status === "connected"),
      activeListings,
      leadCount: leadCounts.total,
      undeliveredLeads: leadCounts.undelivered,
      lastSyncAt: lastRun?.finishedAt ?? null,
      lastSyncStatus: lastRun?.status ?? null,
    })
  }
  return rows
}
