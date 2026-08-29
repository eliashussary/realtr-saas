import { dnsInstructions, nodeDnsResolver, runDomainVerification } from "@realtr/core"
import { domain, and, db, eq } from "@realtr/db"
import { createDomainRepository } from "@realtr/db/domains"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// Custom-domain verification for the connect-domain UI. Verifies ownership (TXT challenge) + pointing
// (CNAME) via a real DNS resolver, transitions the domain lifecycle, and surfaces the DNS records the
// customer must create. Only verified/active domains are served + get a TLS cert (isServableDomain).

const domainInput = z.object({ siteId: z.string().uuid(), hostname: z.string().min(1) })

function rendererBaseHost(): string {
  return process.env.RENDERER_BASE_HOST ?? "sites.realtr.app"
}

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

function canManage(role: string): boolean {
  return role === "owner" || role === "admin"
}

/** Load a domain row only if its site belongs to the caller's organization. */
async function findOrgDomain(organizationId: string, siteId: string, hostname: string) {
  const { site } = await import("@realtr/db")
  const [row] = await db
    .select({
      id: domain.id,
      hostname: domain.hostname,
      status: domain.status,
      verificationToken: domain.verificationToken,
    })
    .from(domain)
    .innerJoin(site, eq(site.id, domain.siteId))
    .where(
      and(
        eq(domain.siteId, siteId),
        eq(domain.hostname, hostname),
        eq(site.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row ?? null
}

/** The DNS records to create + current status, for the connect-domain UI. */
export const getDomainSetupFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => domainInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const row = await findOrgDomain(authorization.organizationId, data.siteId, data.hostname)
    if (!row) return { ok: false as const, code: "not_found" as const }
    return {
      ok: true as const,
      status: row.status,
      instructions: dnsInstructions({
        hostname: row.hostname,
        verificationToken: row.verificationToken,
        expectedCnameTarget: rendererBaseHost(),
      }),
    }
  })

/** Run verification now and transition the domain (pending→verifying→verified/error). */
export const verifyDomainFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => domainInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!canManage(authorization.role)) return { ok: false as const, code: "forbidden" as const }
    const row = await findOrgDomain(authorization.organizationId, data.siteId, data.hostname)
    if (!row) return { ok: false as const, code: "not_found" as const }

    const outcome = await runDomainVerification({
      domainId: row.id,
      expectedCnameTarget: rendererBaseHost(),
      resolver: nodeDnsResolver,
      repository: createDomainRepository(db),
    })
    // Keep the transport flag (`ok`) distinct from the verification result (`verified`).
    return {
      ok: true as const,
      verified: outcome.ok,
      state: outcome.state,
      ownership: outcome.ownership,
      pointing: outcome.pointing,
      reason: outcome.reason,
    }
  })
