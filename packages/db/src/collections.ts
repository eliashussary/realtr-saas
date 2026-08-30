import { and, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { listingCollection } from "./schema"
import type * as schema from "./schema"

// Property-collection repository. All reads/writes are org-scoped; public reads additionally require
// published status. Shared by the app (dashboard CRUD) and @realtr/core (public reads). The `filter`
// column holds a @realtr/core ListingFilter verbatim — typed loosely here to keep this leaf package
// free of a @realtr/core dependency.
export type CollectionDatabase = NodePgDatabase<typeof schema>
export type CollectionRow = typeof listingCollection.$inferSelect

export interface CollectionInput {
  slug: string
  name: string
  description: string
  filter: Record<string, unknown>
  status: "draft" | "published"
  rank: number | null
}

// Published collections lead by rank (lower first, nulls last), then name.
const publishedOrder = sql`${listingCollection.rank} asc nulls last, ${listingCollection.name} asc`

export async function listCollectionsForOrg(
  database: CollectionDatabase,
  organizationId: string,
): Promise<CollectionRow[]> {
  return database
    .select()
    .from(listingCollection)
    .where(eq(listingCollection.organizationId, organizationId))
    .orderBy(publishedOrder)
}

export async function getCollectionForOrg(
  database: CollectionDatabase,
  organizationId: string,
  id: string,
): Promise<CollectionRow | null> {
  const [row] = await database
    .select()
    .from(listingCollection)
    .where(and(eq(listingCollection.id, id), eq(listingCollection.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function createCollection(
  database: CollectionDatabase,
  organizationId: string,
  input: CollectionInput,
): Promise<CollectionRow> {
  const [row] = await database
    .insert(listingCollection)
    .values({
      organizationId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      filter: input.filter,
      status: input.status,
      rank: input.rank,
    })
    .returning()
  if (!row) throw new Error("Failed to create collection")
  return row
}

/** Update a collection, scoped to its org. Returns null if it doesn't belong to the org. */
export async function updateCollection(
  database: CollectionDatabase,
  organizationId: string,
  id: string,
  input: CollectionInput,
): Promise<CollectionRow | null> {
  const [row] = await database
    .update(listingCollection)
    .set({
      slug: input.slug,
      name: input.name,
      description: input.description,
      filter: input.filter,
      status: input.status,
      rank: input.rank,
      updatedAt: new Date(),
    })
    .where(and(eq(listingCollection.id, id), eq(listingCollection.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function deleteCollection(
  database: CollectionDatabase,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await database
    .delete(listingCollection)
    .where(and(eq(listingCollection.id, id), eq(listingCollection.organizationId, organizationId)))
  return (result.rowCount ?? 0) > 0
}

// --- Public reads (published only) ---

export async function listPublishedCollections(
  database: CollectionDatabase,
  organizationId: string,
): Promise<CollectionRow[]> {
  return database
    .select()
    .from(listingCollection)
    .where(
      and(
        eq(listingCollection.organizationId, organizationId),
        eq(listingCollection.status, "published"),
      ),
    )
    .orderBy(publishedOrder)
}

export async function getPublishedCollectionBySlug(
  database: CollectionDatabase,
  organizationId: string,
  slug: string,
): Promise<CollectionRow | null> {
  const [row] = await database
    .select()
    .from(listingCollection)
    .where(
      and(
        eq(listingCollection.organizationId, organizationId),
        eq(listingCollection.slug, slug),
        eq(listingCollection.status, "published"),
      ),
    )
    .limit(1)
  return row ?? null
}
