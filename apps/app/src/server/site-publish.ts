import { db } from "@realtr/db"
import { createSiteDocumentRepository } from "@realtr/db/site-documents"
import { parseSiteDocument } from "@realtr/site/document"
import { can } from "../lib/permissions"
import type { OrganizationAuthorization } from "./authorization"
import { type DraftValidationIssue, toIssues } from "./site-draft"

/** Owners and admins may publish and roll back; agents autosave and preview only (ADR 0004). */
export function canPublish(role: string): boolean {
  return can(role, "site", "publish")
}

export type PublishResult =
  | { ok: true; revisionId: string; publicationNumber: bigint; publishedAt: Date }
  | { ok: false; code: "stale"; currentDraftVersion: bigint }
  | { ok: false; code: "invalid"; issues: DraftValidationIssue[] }
  | { ok: false; code: "forbidden" }
  | { ok: false; code: "not_found" }

/**
 * Validate the current draft and publish it as an immutable revision, atomically moving the live
 * pointer. `expectedDraftVersion` is the client's known version; a stale tab cannot publish.
 */
export async function publishSite(
  authorization: OrganizationAuthorization,
  input: { siteId: string; expectedDraftVersion: bigint },
): Promise<PublishResult> {
  if (!canPublish(authorization.role)) return { ok: false, code: "forbidden" }

  const repository = createSiteDocumentRepository(db)
  const state = await repository.findState(authorization.organizationId, input.siteId)
  if (!state) return { ok: false, code: "not_found" }

  let document: ReturnType<typeof parseSiteDocument>
  try {
    document = parseSiteDocument(state.draftDocument)
  } catch (error) {
    return { ok: false, code: "invalid", issues: toIssues(error) }
  }

  const result = await repository.publishDraft({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    expectedDraftVersion: input.expectedDraftVersion,
    document: document as unknown as Record<string, unknown>,
    schemaVersion: state.draftSchemaVersion,
    actorUserId: authorization.userId,
  })

  switch (result.outcome) {
    case "published":
      return {
        ok: true,
        revisionId: result.revisionId,
        publicationNumber: result.publicationNumber,
        publishedAt: result.publishedAt,
      }
    case "stale":
      return { ok: false, code: "stale", currentDraftVersion: result.currentDraftVersion }
    case "not_found":
      return { ok: false, code: "not_found" }
  }
}

export type RollbackResult =
  | { ok: true; revisionId: string; publicationNumber: bigint; draftVersion: bigint }
  | { ok: false; code: "invalid"; issues: DraftValidationIssue[] }
  | { ok: false; code: "forbidden" }
  | { ok: false; code: "not_found" }

/**
 * Roll back to a historical published revision. Validates the target against the current renderer,
 * then creates a new publication and resets the draft (bumping its version so open editors go stale).
 */
export async function rollbackSite(
  authorization: OrganizationAuthorization,
  input: { siteId: string; targetRevisionId: string; reason?: string },
): Promise<RollbackResult> {
  if (!canPublish(authorization.role)) return { ok: false, code: "forbidden" }

  const repository = createSiteDocumentRepository(db)
  const target = await repository.findRevision(
    authorization.organizationId,
    input.siteId,
    input.targetRevisionId,
  )
  if (!target || target.kind !== "published") return { ok: false, code: "not_found" }

  // ponytail: current schema only. Register document migrations here when a v2 envelope ships.
  let document: ReturnType<typeof parseSiteDocument>
  try {
    document = parseSiteDocument(target.document)
  } catch (error) {
    return { ok: false, code: "invalid", issues: toIssues(error) }
  }

  const result = await repository.rollbackToRevision({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    targetRevisionId: input.targetRevisionId,
    document: document as unknown as Record<string, unknown>,
    schemaVersion: target.schemaVersion,
    actorUserId: authorization.userId,
    reason: input.reason,
  })

  if (result.outcome === "not_found") return { ok: false, code: "not_found" }
  return {
    ok: true,
    revisionId: result.revisionId,
    publicationNumber: result.publicationNumber,
    draftVersion: result.draftVersion,
  }
}
