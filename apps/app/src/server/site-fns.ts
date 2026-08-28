import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const siteIdInput = z.object({ siteId: z.string().uuid() })
const versionInput = siteIdInput.extend({ expectedDraftVersion: z.string().regex(/^\d+$/) })
const saveInput = versionInput.extend({ document: z.unknown(), override: z.boolean().optional() })
const rollbackInput = siteIdInput.extend({
  targetRevisionId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})
const revokeInput = siteIdInput.extend({ grantId: z.string().uuid() })

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

/** Resolve the tenant from the server session; throws for unauthenticated/forbidden callers. */
async function requireAuthorization() {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) throw new Error("Not authorized")
  return authorization
}

export const loadSiteDraftFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => siteIdInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const { loadSiteDraft } = await import("./site-draft")
    const result = await loadSiteDraft(authorization, data.siteId)
    if (!result.ok) return { ok: false as const, code: result.code }
    return {
      ok: true as const,
      document: result.document as Json,
      draftVersion: result.draftVersion.toString(),
      role: authorization.role,
    }
  })

export const saveSiteDraftFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await requireAuthorization()
    const { saveSiteDraft } = await import("./site-draft")
    const result = await saveSiteDraft(authorization, {
      siteId: data.siteId,
      expectedDraftVersion: BigInt(data.expectedDraftVersion),
      document: data.document,
      override: data.override,
    })
    if (result.ok) {
      return {
        ok: true as const,
        draftVersion: result.draftVersion.toString(),
        savedAt: result.savedAt.toISOString(),
      }
    }
    if (result.code === "stale") {
      return {
        ok: false as const,
        code: "stale" as const,
        currentDraftVersion: result.currentDraftVersion.toString(),
      }
    }
    if (result.code === "invalid") {
      return { ok: false as const, code: "invalid" as const, issues: result.issues }
    }
    return { ok: false as const, code: "not_found" as const }
  })

export const publishSiteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => versionInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await requireAuthorization()
    const { publishSite } = await import("./site-publish")
    const result = await publishSite(authorization, {
      siteId: data.siteId,
      expectedDraftVersion: BigInt(data.expectedDraftVersion),
    })
    if (result.ok) {
      return {
        ok: true as const,
        revisionId: result.revisionId,
        publicationNumber: result.publicationNumber.toString(),
        publishedAt: result.publishedAt.toISOString(),
      }
    }
    if (result.code === "stale") {
      return {
        ok: false as const,
        code: "stale" as const,
        currentDraftVersion: result.currentDraftVersion.toString(),
      }
    }
    if (result.code === "invalid") {
      return { ok: false as const, code: "invalid" as const, issues: result.issues }
    }
    return { ok: false as const, code: result.code }
  })

export const rollbackSiteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => rollbackInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await requireAuthorization()
    const { rollbackSite } = await import("./site-publish")
    const result = await rollbackSite(authorization, {
      siteId: data.siteId,
      targetRevisionId: data.targetRevisionId,
      reason: data.reason,
    })
    if (result.ok) {
      return {
        ok: true as const,
        revisionId: result.revisionId,
        publicationNumber: result.publicationNumber.toString(),
        draftVersion: result.draftVersion.toString(),
      }
    }
    if (result.code === "invalid") {
      return { ok: false as const, code: "invalid" as const, issues: result.issues }
    }
    return { ok: false as const, code: result.code }
  })

export const issuePreviewFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => versionInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await requireAuthorization()
    const { issuePreview } = await import("./site-preview")
    const { db, eq, domain } = await import("@realtr/db")
    const result = await issuePreview(authorization, {
      siteId: data.siteId,
      expectedDraftVersion: BigInt(data.expectedDraftVersion),
    })
    if (!result.ok) {
      if (result.code === "stale") {
        return {
          ok: false as const,
          code: "stale" as const,
          currentDraftVersion: result.currentDraftVersion.toString(),
        }
      }
      if (result.code === "invalid") {
        return { ok: false as const, code: "invalid" as const, issues: result.issues }
      }
      return { ok: false as const, code: "not_found" as const }
    }

    // Preview renders on the tenant renderer host (:3000), never the control-centre host.
    const domains = await db.select().from(domain).where(eq(domain.siteId, data.siteId))
    const primary = domains.find((d) => d.isPrimary) ?? domains[0]
    const host = primary ? `${primary.hostname}:3000` : "demo.localhost:3000"
    return {
      ok: true as const,
      url: `http://${host}/preview/${result.token}`,
      grantId: result.grantId,
      expiresAt: result.expiresAt.toISOString(),
    }
  })

export const revokePreviewFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => revokeInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await requireAuthorization()
    const { revokePreview } = await import("./site-preview")
    return revokePreview(authorization, { siteId: data.siteId, grantId: data.grantId })
  })
