import { createServerFn } from "@tanstack/react-start"
import { assertDomainCanBeRegistered, parseDomainInput } from "./domain-input"

export interface DashboardSite {
  id: string
  name: string
  templateId: string
  previewUrl: string
  domains: { hostname: string; status: string; isPrimary: boolean }[]
}

export interface DashboardData {
  orgName: string
  baseHost: string
  sites: DashboardSite[]
}

/** Session-gated dashboard data. Onboards a brand-new user (creates org + first site). */
export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData | null> => {
    const { randomUUID } = await import("node:crypto")
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth } = await import("../lib/auth")
    const { db, eq, member, site, domain, organization } = await import("@realtr/db")
    const { resolveOrganizationAuthorization } = await import("./authorization")
    const { getTemplate } = await import("@realtr/site")

    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session) return null

    const userId = session.user.id
    let authorization = await resolveOrganizationAuthorization(session)

    // Onboarding: new user with no org gets a personal org + a default site (modern template).
    if (
      !authorization.ok &&
      authorization.code === "forbidden" &&
      !session.session.activeOrganizationId
    ) {
      const orgId = randomUUID()
      const emailLocal = session.user.email?.split("@")[0] ?? "My"
      const orgName = `${emailLocal}'s Agency`
      await db.insert(organization).values({
        id: orgId,
        name: orgName,
        slug: `${emailLocal}-${orgId.slice(0, 8)}`.toLowerCase(),
      })
      const memberId = randomUUID()
      await db.insert(member).values({ id: memberId, organizationId: orgId, userId, role: "owner" })
      const tpl = getTemplate("modern")
      await db.insert(site).values({
        organizationId: orgId,
        name: `${orgName} Site`,
        templateId: tpl.meta.id,
        theme: tpl.defaultTheme as Record<string, unknown>,
        pages: tpl.defaultPages as Record<string, unknown>,
      })
      authorization = await resolveOrganizationAuthorization(session)
    }

    if (!authorization.ok) return null
    const org = (
      await db
        .select()
        .from(organization)
        .where(eq(organization.id, authorization.organizationId))
        .limit(1)
    )[0]
    if (!org) return null

    const sites = await db.select().from(site).where(eq(site.organizationId, org.id))
    const baseHost = process.env.RENDERER_BASE_HOST ?? "sites.realtr.app"

    const result: DashboardSite[] = []
    for (const s of sites) {
      const domains = await db.select().from(domain).where(eq(domain.siteId, s.id))
      const primary = domains.find((d) => d.isPrimary) ?? domains[0]
      const previewUrl = primary ? `http://${primary.hostname}:3000` : "http://demo.localhost:3000"
      result.push({
        id: s.id,
        name: s.name,
        templateId: s.templateId,
        previewUrl,
        domains: domains.map((d) => ({
          hostname: d.hostname,
          status: d.status,
          isPrimary: d.isPrimary,
        })),
      })
    }

    return { orgName: org.name, baseHost, sites: result }
  },
)

/** Add a vanity domain to a site (status=pending). */
export const addDomain = createServerFn({ method: "POST" })
  .validator(parseDomainInput)
  .handler(async ({ data }) => {
    const { randomUUID } = await import("node:crypto")
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth } = await import("../lib/auth")
    const { db, domain } = await import("@realtr/db")
    const { findAuthorizedSite, resolveOrganizationAuthorization } = await import("./authorization")

    const session = await auth.api.getSession({ headers: getRequest().headers })
    const authorization = await resolveOrganizationAuthorization(session)
    if (!authorization.ok) throw new Error("Not authorized")

    const hostname = data.hostname
    assertDomainCanBeRegistered(
      hostname,
      process.env.RENDERER_BASE_HOST ?? "sites.realtr.app",
      process.env.NODE_ENV === "production",
    )

    const target = await findAuthorizedSite(authorization, data.siteId)
    if ("ok" in target && !target.ok) throw new Error("Site not found")

    const inserted = await db
      .insert(domain)
      .values({
        siteId: data.siteId,
        hostname,
        status: "pending",
        verificationToken: randomUUID(),
      })
      .onConflictDoNothing()
      .returning({ hostname: domain.hostname })

    if (!inserted[0]) throw new Error("Domain unavailable")

    return { ok: true, hostname }
  })
