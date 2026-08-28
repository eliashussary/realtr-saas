import { createHash, randomBytes } from "node:crypto"
import { db } from "@realtr/db"
import { createSiteDocumentRepository } from "@realtr/db/site-documents"
import { parseSiteDocument } from "@realtr/site/document"
import type { OrganizationAuthorization } from "./authorization"
import { type DraftValidationIssue, toIssues } from "./site-draft"

/** Preview links live for 30 minutes and resolve one immutable snapshot (ADR 0004). */
export const PREVIEW_TTL_MS = 30 * 60 * 1000

export type IssuePreviewResult =
  | { ok: true; token: string; grantId: string; expiresAt: Date }
  | { ok: false; code: "stale"; currentDraftVersion: bigint }
  | { ok: false; code: "invalid"; issues: DraftValidationIssue[] }
  | { ok: false; code: "not_found" }

/**
 * Issue a preview link for the current draft. Any authorized member may preview. A 256-bit token is
 * returned once; only its SHA-256 hash is stored. The snapshot is immutable, so a preview cannot
 * drift mid-session even as the draft changes.
 */
export async function issuePreview(
  authorization: OrganizationAuthorization,
  input: { siteId: string; expectedDraftVersion: bigint },
): Promise<IssuePreviewResult> {
  const repository = createSiteDocumentRepository(db)
  const state = await repository.findState(authorization.organizationId, input.siteId)
  if (!state) return { ok: false, code: "not_found" }
  if (state.draftVersion !== input.expectedDraftVersion) {
    return { ok: false, code: "stale", currentDraftVersion: state.draftVersion }
  }

  let document: ReturnType<typeof parseSiteDocument>
  try {
    document = parseSiteDocument(state.draftDocument)
  } catch (error) {
    return { ok: false, code: "invalid", issues: toIssues(error) }
  }

  const token = randomBytes(32).toString("base64url")
  const tokenHash = createHash("sha256").update(token).digest()
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS)

  const { grantId, revisionId } = await repository.createPreviewGrant({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    document: document as unknown as Record<string, unknown>,
    schemaVersion: state.draftSchemaVersion,
    sourceDraftVersion: state.draftVersion,
    tokenHash,
    expiresAt,
    createdByUserId: authorization.userId,
  })

  await repository.recordAuditEvent({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    actorUserId: authorization.userId,
    action: "site.preview.issue",
    metadata: { grantId, revisionId },
  })

  return { ok: true, token, grantId, expiresAt }
}

export type RevokePreviewResult = { ok: true } | { ok: false; code: "not_found" }

/** Revoke a preview grant within the caller's tenant. */
export async function revokePreview(
  authorization: OrganizationAuthorization,
  input: { siteId: string; grantId: string },
): Promise<RevokePreviewResult> {
  const repository = createSiteDocumentRepository(db)
  const revoked = await repository.revokePreviewGrant({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    grantId: input.grantId,
    now: new Date(),
  })
  if (!revoked) return { ok: false, code: "not_found" }

  await repository.recordAuditEvent({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    actorUserId: authorization.userId,
    action: "site.preview.revoke",
    metadata: { grantId: input.grantId },
  })
  return { ok: true }
}
