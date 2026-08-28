import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { assertDomainCanBeRegistered, parseDomainInput } from "./domain-input"

const subdomainInput = z.object({ siteId: z.string().uuid(), subdomain: z.string().max(63) })

export interface PublishedVersion {
  revisionId: string
  publicationNumber: string
  createdAt: string
  isLive: boolean
  hash: string
}

export interface DashboardSite {
  id: string
  name: string
  templateId: string
  previewUrl: string
  published: boolean
  hasUnpublishedChanges: boolean
  subdomain: string
  draftVersion: string
  draftUpdatedAt: string
  draftHash: string
  publishedVersions: PublishedVersion[]
  domains: { hostname: string; status: string; isPrimary: boolean }[]
}

export interface DashboardData {
  orgName: string
  baseHost: string
  platformHost: string
  canManage: boolean
  sites: DashboardSite[]
}

/** Session-gated dashboard data. Onboards a brand-new user (creates org + first site). */
export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData | null> => {
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth } = await import("../lib/auth")
    const { db, and, desc, eq, site, domain, organization, siteDocumentState, siteRevision } =
      await import("@realtr/db")
    const { resolveOrganizationAuthorization } = await import("./authorization")

    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session) return null

    let authorization = await resolveOrganizationAuthorization(session)

    // Onboarding: new user with no org gets a personal org + a default site + private draft state.
    if (
      !authorization.ok &&
      authorization.code === "forbidden" &&
      !session.session.activeOrganizationId
    ) {
      const { provisionInitialWorkspace } = await import("./onboarding")
      await provisionInitialWorkspace(db, { userId: session.user.id, email: session.user.email })
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

    const { randomUUID } = await import("node:crypto")
    const {
      platformHost,
      platformHostname,
      siteUrl,
      isServableStatus,
      isPlatformHostname,
      subdomainLabel,
    } = await import("./platform")
    const sites = await db.select().from(site).where(eq(site.organizationId, org.id))
    const baseHost = process.env.RENDERER_BASE_HOST ?? "sites.realtr.app"

    const result: DashboardSite[] = []
    for (const s of sites) {
      let domains = await db.select().from(domain).where(eq(domain.siteId, s.id))
      // Auto-heal sites created before platform-subdomain provisioning so the link is always a
      // servable subdomain rather than a pending custom domain.
      if (!domains.some((d) => isServableStatus(d.status))) {
        await db
          .insert(domain)
          .values({
            siteId: s.id,
            hostname: platformHostname(org.slug ?? org.id),
            status: "active",
            verificationToken: randomUUID(),
            isPrimary: true,
          })
          .onConflictDoNothing()
        domains = await db.select().from(domain).where(eq(domain.siteId, s.id))
      }
      const servable = domains.filter((d) => isServableStatus(d.status))
      const platform = domains.find((d) => isPlatformHostname(d.hostname))
      const chosen = platform ?? servable.find((d) => d.isPrimary) ?? servable[0]
      const previewUrl = siteUrl(chosen ? chosen.hostname : platformHostname(org.slug ?? org.id))
      const subdomain = subdomainLabel(platform?.hostname ?? platformHostname(org.slug ?? org.id))
      const [state] = await db
        .select({
          pub: siteDocumentState.publishedRevisionId,
          draftVersion: siteDocumentState.draftVersion,
          draftUpdatedAt: siteDocumentState.draftUpdatedAt,
          checksum: siteDocumentState.draftChecksum,
        })
        .from(siteDocumentState)
        .where(eq(siteDocumentState.siteId, s.id))
        .limit(1)
      const revisions = await db
        .select({
          id: siteRevision.id,
          num: siteRevision.publicationNumber,
          createdAt: siteRevision.createdAt,
          checksum: siteRevision.documentChecksum,
        })
        .from(siteRevision)
        .where(
          and(
            eq(siteRevision.organizationId, org.id),
            eq(siteRevision.siteId, s.id),
            eq(siteRevision.kind, "published"),
          ),
        )
        .orderBy(desc(siteRevision.publicationNumber))
      // Unpublished changes exist when the draft checksum differs from the live revision's.
      const liveChecksum = revisions.find((r) => r.id === state?.pub)?.checksum
      const short = (checksum: string | null) => (checksum ?? "").slice(0, 7)
      result.push({
        id: s.id,
        name: s.name,
        templateId: s.templateId,
        previewUrl,
        published: Boolean(state?.pub),
        hasUnpublishedChanges: Boolean(state?.pub) && state?.checksum !== liveChecksum,
        subdomain,
        draftVersion: (state?.draftVersion ?? 1n).toString(),
        draftUpdatedAt: (state?.draftUpdatedAt ?? new Date()).toISOString(),
        draftHash: short(state?.checksum ?? null),
        publishedVersions: revisions.map((r) => ({
          revisionId: r.id,
          publicationNumber: (r.num ?? 0n).toString(),
          createdAt: r.createdAt.toISOString(),
          isLive: r.id === state?.pub,
          hash: short(r.checksum),
        })),
        domains: domains.map((d) => ({
          hostname: d.hostname,
          status: d.status,
          isPrimary: d.isPrimary,
        })),
      })
    }

    const canManage = authorization.role === "owner" || authorization.role === "admin"
    return { orgName: org.name, baseHost, platformHost: platformHost(), canManage, sites: result }
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

/** Remove a custom domain from a site. The platform subdomain cannot be removed. */
export const removeDomain = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ siteId: z.string().uuid(), hostname: z.string().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth } = await import("../lib/auth")
    const { db, and, eq, domain } = await import("@realtr/db")
    const { findAuthorizedSite, resolveOrganizationAuthorization } = await import("./authorization")
    const { isPlatformHostname } = await import("./platform")

    const session = await auth.api.getSession({ headers: getRequest().headers })
    const authorization = await resolveOrganizationAuthorization(session)
    if (!authorization.ok) throw new Error("Not authorized")

    const target = await findAuthorizedSite(authorization, data.siteId)
    if ("ok" in target && !target.ok) throw new Error("Site not found")

    if (isPlatformHostname(data.hostname)) {
      return { ok: false as const, code: "platform" as const }
    }

    await db
      .delete(domain)
      .where(and(eq(domain.siteId, data.siteId), eq(domain.hostname, data.hostname)))
    return { ok: true as const }
  })

/** Change a site's platform subdomain, verifying the new hostname is free before committing. */
export const changeSubdomain = createServerFn({ method: "POST" })
  .validator((input: unknown) => subdomainInput.parse(input))
  .handler(async ({ data }) => {
    const { randomUUID } = await import("node:crypto")
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth } = await import("../lib/auth")
    const { db, eq, domain } = await import("@realtr/db")
    const { findAuthorizedSite, resolveOrganizationAuthorization } = await import("./authorization")
    const { validateSubdomain, platformHost, isPlatformHostname } = await import("./platform")

    const session = await auth.api.getSession({ headers: getRequest().headers })
    const authorization = await resolveOrganizationAuthorization(session)
    if (!authorization.ok) throw new Error("Not authorized")

    const target = await findAuthorizedSite(authorization, data.siteId)
    if ("ok" in target && !target.ok) throw new Error("Site not found")

    const validation = validateSubdomain(data.subdomain)
    if (!validation.ok)
      return { ok: false as const, code: "invalid" as const, reason: validation.reason }

    const hostname = `${validation.label}.${platformHost()}`
    const [existing] = await db
      .select({ siteId: domain.siteId })
      .from(domain)
      .where(eq(domain.hostname, hostname))
      .limit(1)
    if (existing && existing.siteId !== data.siteId) {
      return { ok: false as const, code: "taken" as const }
    }
    if (existing && existing.siteId === data.siteId) {
      return { ok: true as const, subdomain: validation.label, hostname }
    }

    const rows = await db.select().from(domain).where(eq(domain.siteId, data.siteId))
    const current = rows.find((row) => isPlatformHostname(row.hostname))
    try {
      if (current) {
        await db
          .update(domain)
          .set({ hostname, status: "active", isPrimary: true, updatedAt: new Date() })
          .where(eq(domain.id, current.id))
      } else {
        await db.insert(domain).values({
          siteId: data.siteId,
          hostname,
          status: "active",
          isPrimary: true,
          verificationToken: randomUUID(),
        })
      }
    } catch (error) {
      // Unique-violation race: someone claimed it between the check and the write.
      if ((error as { code?: string })?.code === "23505") {
        return { ok: false as const, code: "taken" as const }
      }
      throw error
    }

    return { ok: true as const, subdomain: validation.label, hostname }
  })
