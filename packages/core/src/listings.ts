import { db } from "@realtr/db"
import { type ActiveListingRow, getActiveListing, listActiveListings } from "@realtr/db/listings"

// Public read side for the renderer: a tenant's currently-active listings. Kept behind core so the
// renderer never touches the db directly and the query stays tenant-scoped.

export type { ActiveListingRow }

export function listPublishedListings(
  organizationId: string,
  options: { limit?: number } = {},
): Promise<ActiveListingRow[]> {
  return listActiveListings(db, organizationId, options)
}

export function getPublishedListing(
  organizationId: string,
  sourceListingId: string,
): Promise<ActiveListingRow | null> {
  return getActiveListing(db, organizationId, sourceListingId)
}
