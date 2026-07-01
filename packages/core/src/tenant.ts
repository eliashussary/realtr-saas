import { domain, db, eq, organization, site } from "@realtr/db"

export interface ResolvedSite {
  site: typeof site.$inferSelect
  domain: typeof domain.$inferSelect
  organization: typeof organization.$inferSelect
}

/** Strip port and lowercase a Host header value. */
export function normalizeHost(host: string): string {
  return (host.split(":")[0] ?? host).trim().toLowerCase()
}

/**
 * Resolve a request Host -> domain -> site (+ org). Returns null if the host isn't a
 * known tenant domain. Callers decide what to do with `domain.status`
 * (renderer serves verified/active; the Caddy tls-check gates cert issuance).
 */
export async function resolveSiteByHost(host: string): Promise<ResolvedSite | null> {
  const hostname = normalizeHost(host)
  const rows = await db
    .select({ site, domain, organization })
    .from(domain)
    .innerJoin(site, eq(site.id, domain.siteId))
    .innerJoin(organization, eq(organization.id, site.organizationId))
    .where(eq(domain.hostname, hostname))
    .limit(1)

  return rows[0] ?? null
}

/** True if a domain may receive a TLS cert (backs the Caddy on-demand `ask` endpoint). */
export async function isServableDomain(host: string): Promise<boolean> {
  const hostname = normalizeHost(host)
  const rows = await db
    .select({ status: domain.status })
    .from(domain)
    .where(eq(domain.hostname, hostname))
    .limit(1)
  const status = rows[0]?.status
  return status === "verified" || status === "active"
}
