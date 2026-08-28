import { type InferInsertModel, and, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { siteAuditEvent, siteDocumentState, siteRevision } from "./schema"

export type SiteDocumentDatabase = NodePgDatabase<typeof schema>
export type NewSiteDocumentState = InferInsertModel<typeof siteDocumentState>
export type NewSiteRevision = InferInsertModel<typeof siteRevision>
export type NewSiteAuditEvent = InferInsertModel<typeof siteAuditEvent>

/**
 * Compare-and-swap draft save. Validation is the caller's responsibility (via
 * `@realtr/site/document`) so this leaf package never depends on the render layer.
 */
export interface SaveDraftInput {
  organizationId: string
  siteId: string
  expectedDraftVersion: bigint
  document: Record<string, unknown>
  schemaVersion: number
  updatedByUserId: string | null
  /** A deliberate overwrite of a conflicting version; recorded distinctly for audit. */
  override?: boolean
}

export type SaveDraftResult =
  | { outcome: "saved"; draftVersion: bigint; savedAt: Date }
  | { outcome: "stale"; currentDraftVersion: bigint }
  | { outcome: "not_found" }

/**
 * Tenant-scoped persistence for document state and append-only revisions.
 * Validation belongs to @realtr/site/document before values reach this repository.
 */
export function createSiteDocumentRepository(database: SiteDocumentDatabase) {
  return {
    async findState(organizationId: string, siteId: string) {
      const [state] = await database
        .select()
        .from(siteDocumentState)
        .where(
          and(
            eq(siteDocumentState.organizationId, organizationId),
            eq(siteDocumentState.siteId, siteId),
          ),
        )
        .limit(1)
      return state
    },

    async createState(value: NewSiteDocumentState) {
      const [state] = await database.insert(siteDocumentState).values(value).returning()
      if (!state) throw new Error("Failed to create site document state")
      return state
    },

    async findRevision(organizationId: string, siteId: string, revisionId: string) {
      const [revision] = await database
        .select()
        .from(siteRevision)
        .where(
          and(
            eq(siteRevision.organizationId, organizationId),
            eq(siteRevision.siteId, siteId),
            eq(siteRevision.id, revisionId),
          ),
        )
        .limit(1)
      return revision
    },

    async createRevision(value: NewSiteRevision) {
      const [revision] = await database.insert(siteRevision).values(value).returning()
      if (!revision) throw new Error("Failed to create site revision")
      return revision
    },

    async recordAuditEvent(value: NewSiteAuditEvent) {
      const [event] = await database.insert(siteAuditEvent).values(value).returning()
      if (!event) throw new Error("Failed to record audit event")
      return event
    },

    /**
     * Advance the draft only when `expectedDraftVersion` still matches, then audit the save in the
     * same transaction. A missing/cross-tenant site and a stale writer are distinguished without
     * revealing another tenant's site existence.
     */
    async saveDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
      return database.transaction(async (tx) => {
        const [current] = await tx
          .select({ draftVersion: siteDocumentState.draftVersion })
          .from(siteDocumentState)
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )
          .limit(1)
        if (!current) return { outcome: "not_found" }

        const [saved] = await tx
          .update(siteDocumentState)
          .set({
            draftDocument: input.document,
            draftSchemaVersion: input.schemaVersion,
            draftVersion: sql`${siteDocumentState.draftVersion} + 1`,
            draftUpdatedAt: sql`now()`,
            draftUpdatedByUserId: input.updatedByUserId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
              eq(siteDocumentState.draftVersion, input.expectedDraftVersion),
            ),
          )
          .returning({
            draftVersion: siteDocumentState.draftVersion,
            savedAt: siteDocumentState.draftUpdatedAt,
          })

        if (!saved) return { outcome: "stale", currentDraftVersion: current.draftVersion }

        await tx.insert(siteAuditEvent).values({
          organizationId: input.organizationId,
          siteId: input.siteId,
          actorUserId: input.updatedByUserId,
          action: input.override ? "site_draft.override" : "site_draft.save",
          metadata: { draftVersion: saved.draftVersion.toString() },
        })

        return { outcome: "saved", draftVersion: saved.draftVersion, savedAt: saved.savedAt }
      })
    },
  }
}
