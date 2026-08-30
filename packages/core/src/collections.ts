import { db } from "@realtr/db"
import { getPublishedCollectionBySlug, listPublishedCollections } from "@realtr/db/collections"
import type { ListingFilter } from "./listing-filter"

// Public read side for property collections: a tenant's published, named saved-searches. The stored
// jsonb filter is a ListingFilter (written through the validated dashboard), cast back here.

export interface PublishedCollection {
  slug: string
  name: string
  description: string
  filter: ListingFilter
  rank: number | null
}

function toPublic(row: {
  slug: string
  name: string
  description: string
  filter: Record<string, unknown>
  rank: number | null
}): PublishedCollection {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    filter: (row.filter ?? {}) as ListingFilter,
    rank: row.rank,
  }
}

export async function publishedCollections(organizationId: string): Promise<PublishedCollection[]> {
  return (await listPublishedCollections(db, organizationId)).map(toPublic)
}

export async function publishedCollectionBySlug(
  organizationId: string,
  slug: string,
): Promise<PublishedCollection | null> {
  const row = await getPublishedCollectionBySlug(db, organizationId, slug)
  return row ? toPublic(row) : null
}
