import { db } from "@realtr/db"
import { createSiteDocumentRepository } from "@realtr/db/site-documents"
import {
  CURRENT_SITE_DOCUMENT_SCHEMA_VERSION,
  type SiteDocumentV1,
  parseSiteDocument,
} from "@realtr/site/document"
import type { OrganizationAuthorization } from "./authorization"

export interface DraftValidationIssue {
  path: string
  message: string
}

export type LoadDraftResult =
  | { ok: true; document: SiteDocumentV1; draftVersion: bigint }
  | { ok: false; code: "not_found" }

export type SaveDraftResult =
  | { ok: true; draftVersion: bigint; savedAt: Date }
  | { ok: false; code: "stale"; currentDraftVersion: bigint }
  | { ok: false; code: "invalid"; issues: DraftValidationIssue[] }
  | { ok: false; code: "not_found" }

/** Authorized draft load. Cross-tenant and absent sites are the same `not_found` outcome. */
export async function loadSiteDraft(
  authorization: OrganizationAuthorization,
  siteId: string,
): Promise<LoadDraftResult> {
  const repository = createSiteDocumentRepository(db)
  const state = await repository.findState(authorization.organizationId, siteId)
  if (!state) return { ok: false, code: "not_found" }
  // Persisted draft is validated on write; parse defensively so a corrupt row cannot reach the editor.
  const parsed = tryParse(state.draftDocument)
  if (!parsed.ok) return { ok: false, code: "not_found" }
  return { ok: true, document: parsed.document, draftVersion: state.draftVersion }
}

export interface SaveDraftInput {
  siteId: string
  expectedDraftVersion: bigint
  document: unknown
  /** A deliberate overwrite of a conflicting version; audited distinctly. Requires a fresh version. */
  override?: boolean
}

/**
 * Compare-and-swap autosave. Validates the whole document before persistence, then delegates the
 * atomic version check and audit write to the tenant-scoped repository.
 */
export async function saveSiteDraft(
  authorization: OrganizationAuthorization,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const parsed = tryParse(input.document)
  if (!parsed.ok) return { ok: false, code: "invalid", issues: parsed.issues }

  const repository = createSiteDocumentRepository(db)
  const result = await repository.saveDraft({
    organizationId: authorization.organizationId,
    siteId: input.siteId,
    expectedDraftVersion: input.expectedDraftVersion,
    document: parsed.document as unknown as Record<string, unknown>,
    schemaVersion: CURRENT_SITE_DOCUMENT_SCHEMA_VERSION,
    updatedByUserId: authorization.userId,
    override: input.override,
  })

  switch (result.outcome) {
    case "saved":
      return { ok: true, draftVersion: result.draftVersion, savedAt: result.savedAt }
    case "stale":
      return { ok: false, code: "stale", currentDraftVersion: result.currentDraftVersion }
    case "not_found":
      return { ok: false, code: "not_found" }
  }
}

type ParseResult =
  | { ok: true; document: SiteDocumentV1 }
  | { ok: false; issues: DraftValidationIssue[] }

function tryParse(input: unknown): ParseResult {
  try {
    return { ok: true, document: parseSiteDocument(input) }
  } catch (error) {
    return { ok: false, issues: toIssues(error) }
  }
}

/** Extract structured validation paths from a ZodError, falling back to a single message. */
function toIssues(error: unknown): DraftValidationIssue[] {
  const zodIssues = (error as { issues?: unknown })?.issues
  if (Array.isArray(zodIssues)) {
    return zodIssues.map((issue) => ({
      path: Array.isArray(issue?.path) ? issue.path.join(".") : "",
      message: typeof issue?.message === "string" ? issue.message : "Invalid value",
    }))
  }
  return [{ path: "", message: error instanceof Error ? error.message : "Invalid document" }]
}
