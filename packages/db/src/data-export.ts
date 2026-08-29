import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import {
  domain,
  agentProfile,
  asset,
  integration,
  lead,
  listing,
  member,
  organization,
  site,
  siteRevision,
  subscription,
  user,
} from "./schema"
import type * as schema from "./schema"

// Per-tenant data export + erasure (M7-A7, privacy/compliance). Export gathers everything Realtr holds
// for one organization into a JSON-serializable object; erasure deletes the organization row and lets
// the FK cascade remove all tenant-scoped data. Both are org-scoped — no other tenant's data is touched.
export type DataDatabase = NodePgDatabase<typeof schema>

export interface OrganizationExport {
  exportedAt: string
  organization: Record<string, unknown> | null
  members: Array<Record<string, unknown>>
  sites: Array<Record<string, unknown>>
  publishedRevisions: Array<Record<string, unknown>>
  domains: Array<Record<string, unknown>>
  integrations: Array<Record<string, unknown>>
  listings: Array<Record<string, unknown>>
  leads: Array<Record<string, unknown>>
  agentProfiles: Array<Record<string, unknown>>
  assets: Array<Record<string, unknown>>
  subscription: Record<string, unknown> | null
}

/**
 * Gather all data Realtr holds for one organization, for a data-access request. Integration configs
 * (encrypted third-party credentials) are redacted — an access export returns the tenant's own data,
 * not the secrets used to reach external systems.
 */
export async function exportOrganizationData(
  database: DataDatabase,
  organizationId: string,
): Promise<OrganizationExport> {
  const [org] = await database
    .select()
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  const members = await database
    .select({
      memberId: member.id,
      role: member.role,
      createdAt: member.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))

  const sites = await database.select().from(site).where(eq(site.organizationId, organizationId))

  // Published revisions only (the live content); drafts are working state, not export-worthy history.
  const publishedRevisions = await database
    .select({
      id: siteRevision.id,
      siteId: siteRevision.siteId,
      kind: siteRevision.kind,
      document: siteRevision.document,
      createdAt: siteRevision.createdAt,
    })
    .from(siteRevision)
    .where(eq(siteRevision.organizationId, organizationId))

  const domains = await database
    .select({ hostname: domain.hostname, status: domain.status, createdAt: domain.createdAt })
    .from(domain)
    .innerJoin(site, eq(site.id, domain.siteId))
    .where(eq(site.organizationId, organizationId))

  // Redact config: it holds encrypted third-party credentials, not the tenant's own data.
  const integrations = await database
    .select({
      kind: integration.kind,
      provider: integration.provider,
      status: integration.status,
      config: integration.config,
      createdAt: integration.createdAt,
    })
    .from(integration)
    .where(eq(integration.organizationId, organizationId))
  const integrationsRedacted = integrations.map((i) => ({ ...i, config: "[redacted]" }))

  const listings = await database
    .select()
    .from(listing)
    .where(eq(listing.organizationId, organizationId))

  const leads = await database.select().from(lead).where(eq(lead.organizationId, organizationId))

  const agentProfiles = await database
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.organizationId, organizationId))

  const assets = await database
    .select({
      id: asset.id,
      url: asset.url,
      contentType: asset.contentType,
      createdAt: asset.createdAt,
    })
    .from(asset)
    .where(eq(asset.organizationId, organizationId))

  const [sub] = await database
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1)

  return {
    exportedAt: new Date().toISOString(),
    organization: org ?? null,
    members,
    sites,
    publishedRevisions,
    domains,
    integrations: integrationsRedacted,
    listings,
    leads,
    agentProfiles,
    assets,
    subscription: sub ?? null,
  }
}

/**
 * Erase a tenant: delete the organization row. Every tenant-scoped table FK-cascades from it (members,
 * sites + revisions/state/grants, domains, integrations, listings, leads, agent profiles, assets,
 * subscription). Audit rows reference the org with ON DELETE SET NULL, so the trail survives.
 *
 * Not handled here (documented in docs/data-handling.md): S3 asset objects (only their rows cascade)
 * and any live Stripe subscription (cancel via the Portal / Stripe before erasure).
 */
export async function deleteOrganization(
  database: DataDatabase,
  organizationId: string,
): Promise<void> {
  await database.delete(organization).where(eq(organization.id, organizationId))
}
