import { type InferInsertModel, and, eq, gt, isNull, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { siteAuditEvent, siteDocumentState, sitePreviewGrant, siteRevision } from "./schema"

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

export interface PublishDraftInput {
  organizationId: string
  siteId: string
  expectedDraftVersion: bigint
  document: Record<string, unknown>
  schemaVersion: number
  actorUserId: string | null
}

export type PublishDraftResult =
  | { outcome: "published"; revisionId: string; publicationNumber: bigint; publishedAt: Date }
  | { outcome: "stale"; currentDraftVersion: bigint }
  | { outcome: "not_found" }

export interface RollbackInput {
  organizationId: string
  siteId: string
  targetRevisionId: string
  document: Record<string, unknown>
  schemaVersion: number
  actorUserId: string | null
  reason?: string
}

export type RollbackResult =
  | { outcome: "rolled_back"; revisionId: string; publicationNumber: bigint; draftVersion: bigint }
  | { outcome: "not_found" }

export interface CreatePreviewGrantInput {
  organizationId: string
  siteId: string
  document: Record<string, unknown>
  schemaVersion: number
  sourceDraftVersion: bigint
  tokenHash: Buffer
  expiresAt: Date
  createdByUserId: string
}

export interface ResolvedPreview {
  organizationId: string
  siteId: string
  revisionId: string
  document: Record<string, unknown>
  schemaVersion: number
}

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

    /**
     * Snapshot the (validated) draft as an immutable published revision and atomically move the
     * live pointer, all under a `FOR UPDATE` lock on the state row. The caller supplies the
     * document; a matching `expectedDraftVersion` under lock guarantees it equals the current draft.
     */
    async publishDraft(input: PublishDraftInput): Promise<PublishDraftResult> {
      return database.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(siteDocumentState)
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )
          .limit(1)
          .for("update")
        if (!state) return { outcome: "not_found" }
        if (state.draftVersion !== input.expectedDraftVersion) {
          return { outcome: "stale", currentDraftVersion: state.draftVersion }
        }

        const publicationNumber = state.nextPublicationNumber
        const [revision] = await tx
          .insert(siteRevision)
          .values({
            organizationId: input.organizationId,
            siteId: input.siteId,
            kind: "published",
            document: input.document,
            schemaVersion: input.schemaVersion,
            sourceDraftVersion: input.expectedDraftVersion,
            publicationNumber,
            actorType: "user",
            createdByUserId: input.actorUserId,
          })
          .returning({ id: siteRevision.id, createdAt: siteRevision.createdAt })
        if (!revision) throw new Error("Failed to create published revision")

        await tx
          .update(siteDocumentState)
          .set({
            publishedRevisionId: revision.id,
            nextPublicationNumber: publicationNumber + 1n,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )

        await tx.insert(siteAuditEvent).values({
          organizationId: input.organizationId,
          siteId: input.siteId,
          actorUserId: input.actorUserId,
          action: "site.publish",
          metadata: { publicationNumber: publicationNumber.toString(), revisionId: revision.id },
        })

        return {
          outcome: "published",
          revisionId: revision.id,
          publicationNumber,
          publishedAt: revision.createdAt,
        }
      })
    },

    /**
     * Roll back to a historical published revision by creating a NEW published revision from its
     * (validated) document, moving the pointer, and resetting the draft so a stale editor cannot
     * republish the old draft. History is never mutated; publication numbers are never reused.
     */
    async rollbackToRevision(input: RollbackInput): Promise<RollbackResult> {
      return database.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(siteDocumentState)
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )
          .limit(1)
          .for("update")
        if (!state) return { outcome: "not_found" }

        const [target] = await tx
          .select({ id: siteRevision.id })
          .from(siteRevision)
          .where(
            and(
              eq(siteRevision.organizationId, input.organizationId),
              eq(siteRevision.siteId, input.siteId),
              eq(siteRevision.id, input.targetRevisionId),
              eq(siteRevision.kind, "published"),
            ),
          )
          .limit(1)
        if (!target) return { outcome: "not_found" }

        const publicationNumber = state.nextPublicationNumber
        const nextDraftVersion = state.draftVersion + 1n
        const [revision] = await tx
          .insert(siteRevision)
          .values({
            organizationId: input.organizationId,
            siteId: input.siteId,
            kind: "published",
            document: input.document,
            schemaVersion: input.schemaVersion,
            sourceDraftVersion: state.draftVersion,
            publicationNumber,
            actorType: "user",
            createdByUserId: input.actorUserId,
            reason: input.reason,
            basedOnRevisionId: input.targetRevisionId,
          })
          .returning({ id: siteRevision.id })
        if (!revision) throw new Error("Failed to create rollback revision")

        await tx
          .update(siteDocumentState)
          .set({
            publishedRevisionId: revision.id,
            nextPublicationNumber: publicationNumber + 1n,
            draftDocument: input.document,
            draftSchemaVersion: input.schemaVersion,
            draftVersion: nextDraftVersion,
            draftUpdatedAt: sql`now()`,
            draftUpdatedByUserId: input.actorUserId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )

        await tx.insert(siteAuditEvent).values({
          organizationId: input.organizationId,
          siteId: input.siteId,
          actorUserId: input.actorUserId,
          action: "site.rollback",
          metadata: {
            publicationNumber: publicationNumber.toString(),
            revisionId: revision.id,
            basedOnRevisionId: input.targetRevisionId,
          },
        })

        return {
          outcome: "rolled_back",
          revisionId: revision.id,
          publicationNumber,
          draftVersion: nextDraftVersion,
        }
      })
    },

    /** Snapshot the (validated) draft as an immutable preview revision and mint a scoped grant. */
    async createPreviewGrant(input: CreatePreviewGrantInput) {
      return database.transaction(async (tx) => {
        const [revision] = await tx
          .insert(siteRevision)
          .values({
            organizationId: input.organizationId,
            siteId: input.siteId,
            kind: "preview",
            document: input.document,
            schemaVersion: input.schemaVersion,
            sourceDraftVersion: input.sourceDraftVersion,
            actorType: "user",
            createdByUserId: input.createdByUserId,
          })
          .returning({ id: siteRevision.id })
        if (!revision) throw new Error("Failed to create preview revision")

        const [grant] = await tx
          .insert(sitePreviewGrant)
          .values({
            organizationId: input.organizationId,
            siteId: input.siteId,
            revisionId: revision.id,
            tokenHash: input.tokenHash,
            createdByUserId: input.createdByUserId,
            expiresAt: input.expiresAt,
          })
          .returning({ id: sitePreviewGrant.id })
        if (!grant) throw new Error("Failed to create preview grant")

        return { grantId: grant.id, revisionId: revision.id }
      })
    },

    /**
     * Resolve a raw-token hash to its immutable revision for public preview rendering. Enforces
     * revocation and expiry, and records access via `lastUsedAt`. Returns undefined for any
     * missing/expired/revoked token so the caller can respond with a generic 404.
     */
    async resolvePreviewGrant(tokenHash: Buffer, now: Date): Promise<ResolvedPreview | undefined> {
      const [row] = await database
        .select({
          grantId: sitePreviewGrant.id,
          organizationId: sitePreviewGrant.organizationId,
          siteId: sitePreviewGrant.siteId,
          revisionId: sitePreviewGrant.revisionId,
          document: siteRevision.document,
          schemaVersion: siteRevision.schemaVersion,
        })
        .from(sitePreviewGrant)
        .innerJoin(siteRevision, eq(siteRevision.id, sitePreviewGrant.revisionId))
        .where(
          and(
            eq(sitePreviewGrant.tokenHash, tokenHash),
            isNull(sitePreviewGrant.revokedAt),
            gt(sitePreviewGrant.expiresAt, now),
          ),
        )
        .limit(1)
      if (!row) return undefined

      await database
        .update(sitePreviewGrant)
        .set({ lastUsedAt: now })
        .where(eq(sitePreviewGrant.id, row.grantId))

      return {
        organizationId: row.organizationId,
        siteId: row.siteId,
        revisionId: row.revisionId,
        document: row.document,
        schemaVersion: row.schemaVersion,
      }
    },

    /**
     * Replace the draft with a (validated) document and bump its version — used to discard draft
     * changes by resetting to the live published revision. Locks the state row and audits.
     */
    async resetDraft(input: {
      organizationId: string
      siteId: string
      document: Record<string, unknown>
      schemaVersion: number
      actorUserId: string | null
    }): Promise<{ outcome: "reset"; draftVersion: bigint } | { outcome: "not_found" }> {
      return database.transaction(async (tx) => {
        const [state] = await tx
          .select({ draftVersion: siteDocumentState.draftVersion })
          .from(siteDocumentState)
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )
          .limit(1)
          .for("update")
        if (!state) return { outcome: "not_found" }

        const nextDraftVersion = state.draftVersion + 1n
        await tx
          .update(siteDocumentState)
          .set({
            draftDocument: input.document,
            draftSchemaVersion: input.schemaVersion,
            draftVersion: nextDraftVersion,
            draftUpdatedAt: sql`now()`,
            draftUpdatedByUserId: input.actorUserId,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(siteDocumentState.organizationId, input.organizationId),
              eq(siteDocumentState.siteId, input.siteId),
            ),
          )
        await tx.insert(siteAuditEvent).values({
          organizationId: input.organizationId,
          siteId: input.siteId,
          actorUserId: input.actorUserId,
          action: "site_draft.discard",
          metadata: { draftVersion: nextDraftVersion.toString() },
        })
        return { outcome: "reset", draftVersion: nextDraftVersion }
      })
    },

    /** Revoke a grant within its tenant. Returns false if it is absent or already revoked. */
    async revokePreviewGrant(input: {
      organizationId: string
      siteId: string
      grantId: string
      now: Date
    }): Promise<boolean> {
      const revoked = await database
        .update(sitePreviewGrant)
        .set({ revokedAt: input.now })
        .where(
          and(
            eq(sitePreviewGrant.organizationId, input.organizationId),
            eq(sitePreviewGrant.siteId, input.siteId),
            eq(sitePreviewGrant.id, input.grantId),
            isNull(sitePreviewGrant.revokedAt),
          ),
        )
        .returning({ id: sitePreviewGrant.id })
      return revoked.length > 0
    },
  }
}
