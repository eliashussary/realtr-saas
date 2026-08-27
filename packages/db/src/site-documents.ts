import { type InferInsertModel, and, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { siteDocumentState, siteRevision } from "./schema"

export type SiteDocumentDatabase = NodePgDatabase<typeof schema>
export type NewSiteDocumentState = InferInsertModel<typeof siteDocumentState>
export type NewSiteRevision = InferInsertModel<typeof siteRevision>

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
  }
}
