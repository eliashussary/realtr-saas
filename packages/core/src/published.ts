import { db } from "@realtr/db"
import { createSiteDocumentRepository } from "@realtr/db/site-documents"
import { resolveSiteByHost } from "./tenant"

export type PublishedSiteResult =
  | {
      status: "ok"
      organizationId: string
      siteId: string
      revisionId: string
      checksum: string
      document: Record<string, unknown>
    }
  | { status: "not_found" }
  | { status: "error" }

/**
 * Resolve a request host to its live published revision for public rendering. Fail-closed: an
 * unknown/unservable host or an unpublished site is `not_found`; a set pointer whose revision row is
 * missing is `error` (503), never a draft or template-default fallback (ADR 0004).
 */
export async function resolvePublishedSite(host: string): Promise<PublishedSiteResult> {
  const resolved = await resolveSiteByHost(host)
  if (!resolved) return { status: "not_found" }

  const repository = createSiteDocumentRepository(db)
  const state = await repository.findState(resolved.organization.id, resolved.site.id)
  if (!state?.publishedRevisionId) return { status: "not_found" }

  const revision = await repository.findRevision(
    resolved.organization.id,
    resolved.site.id,
    state.publishedRevisionId,
  )
  if (!revision) return { status: "error" }

  return {
    status: "ok",
    organizationId: resolved.organization.id,
    siteId: resolved.site.id,
    revisionId: revision.id,
    checksum: revision.documentChecksum ?? revision.id,
    document: revision.document,
  }
}
