import { db } from "@realtr/db"
import {
  type ActiveListingRow,
  getActiveListing,
  listActiveListings,
  listFeaturedListings,
} from "@realtr/db/listings"

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

/** Featured, active listings for a "featured" surface (e.g. the homepage listing block). */
export function listFeaturedPublishedListings(
  organizationId: string,
  options: { limit?: number } = {},
): Promise<ActiveListingRow[]> {
  return listFeaturedListings(db, organizationId, options)
}
