import { db } from "@realtr/db"
import { type AreaFacet, type AreaPolygon, getAreaPolygons, listAreaFacets } from "@realtr/db/areas"
import {
  type ActiveListingRow,
  type ListingBounds,
  type ListingFacets,
  type ListingMarker,
  countListings,
  getActiveListing,
  listActiveListings,
  listFeaturedListings,
  listingBounds,
  listingFacets,
  listingMapMarkers,
  searchListings,
} from "@realtr/db/listings"
import type { ListingFilter } from "./listing-filter"

// Public read side for the renderer: a tenant's currently-active listings. Kept behind core so the
// renderer never touches the db directly and the query stays tenant-scoped.

export type { ActiveListingRow, ListingBounds, ListingFacets, ListingMarker }
export type { AreaFacet, AreaPolygon }

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

// Public faceted search over a tenant's active listings. The renderer passes a ListingFilter parsed
// from the URL; each helper stays tenant-scoped behind core.

export function searchPublishedListings(
  organizationId: string,
  filter: ListingFilter,
  options: { limit?: number; offset?: number } = {},
): Promise<ActiveListingRow[]> {
  return searchListings(db, organizationId, filter, options)
}

export function countPublishedListings(
  organizationId: string,
  filter: ListingFilter,
): Promise<number> {
  return countListings(db, organizationId, filter)
}

export function publishedListingFacets(organizationId: string): Promise<ListingFacets> {
  return listingFacets(db, organizationId)
}

export function publishedListingBounds(
  organizationId: string,
  filter: ListingFilter,
): Promise<ListingBounds | null> {
  return listingBounds(db, organizationId, filter)
}

export function publishedListingMarkers(
  organizationId: string,
  filter: ListingFilter,
  options: { limit?: number } = {},
): Promise<ListingMarker[]> {
  return listingMapMarkers(db, organizationId, filter, options)
}

/** Neighbourhood areas that contain the tenant's active listings, for the area filter. */
export function publishedAreaFacets(organizationId: string): Promise<AreaFacet[]> {
  return listAreaFacets(db, organizationId)
}

/** GeoJSON for the given area ids, to outline the selected neighbourhoods on the map. */
export function publishedAreaPolygons(ids: ReadonlyArray<string>): Promise<AreaPolygon[]> {
  return getAreaPolygons(db, ids)
}
