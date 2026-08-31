import { db } from "@realtr/db"
import {
  type AreaPolygon,
  type CuratedArea,
  getAreaPolygons,
  listCuratedAreas,
} from "@realtr/db/areas"
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
import { type ServiceAreaBBox, getServiceArea } from "@realtr/db/service-areas"
import type { ListingFilter } from "./listing-filter"

// Public read side for the renderer: a tenant's currently-active listings. Kept behind core so the
// renderer never touches the db directly and the query stays tenant-scoped. Every public read is also
// constrained to the tenant's service area (if configured) so the site only shows its market.

async function serviceAreaFor(organizationId: string): Promise<ServiceAreaBBox | undefined> {
  const sa = await getServiceArea(db, organizationId)
  return sa
    ? { minLng: sa.minLng, minLat: sa.minLat, maxLng: sa.maxLng, maxLat: sa.maxLat }
    : undefined
}

export type { AreaPolygon, CuratedArea }

export type { ActiveListingRow, ListingBounds, ListingFacets, ListingMarker }

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

export async function searchPublishedListings(
  organizationId: string,
  filter: ListingFilter,
  options: { limit?: number; offset?: number } = {},
): Promise<ActiveListingRow[]> {
  const serviceArea = await serviceAreaFor(organizationId)
  return searchListings(db, organizationId, filter, { ...options, serviceArea })
}

export async function countPublishedListings(
  organizationId: string,
  filter: ListingFilter,
): Promise<number> {
  const serviceArea = await serviceAreaFor(organizationId)
  return countListings(db, organizationId, filter, { serviceArea })
}

export async function publishedListingFacets(organizationId: string): Promise<ListingFacets> {
  const serviceArea = await serviceAreaFor(organizationId)
  return listingFacets(db, organizationId, { serviceArea })
}

export async function publishedListingBounds(
  organizationId: string,
  filter: ListingFilter,
): Promise<ListingBounds | null> {
  const serviceArea = await serviceAreaFor(organizationId)
  return listingBounds(db, organizationId, filter, { serviceArea })
}

export async function publishedListingMarkers(
  organizationId: string,
  filter: ListingFilter,
  options: { limit?: number } = {},
): Promise<ListingMarker[]> {
  const serviceArea = await serviceAreaFor(organizationId)
  return listingMapMarkers(db, organizationId, filter, { ...options, serviceArea })
}

/**
 * The neighbourhood areas for the public site's area filter: the tenant's curated set (rank-ordered),
 * falling back to all areas containing their active listings when nothing is curated. Grouped by
 * parentRegion → region so duplicate names read as "Lakeview (Oshawa)" vs "Lakeview (Mississauga)".
 */
export async function publishedAreaFacets(organizationId: string): Promise<CuratedArea[]> {
  const serviceArea = await serviceAreaFor(organizationId)
  return listCuratedAreas(db, organizationId, { serviceArea })
}

/** GeoJSON for the given area ids, to outline the selected neighbourhoods on the map. */
export function publishedAreaPolygons(ids: ReadonlyArray<string>): Promise<AreaPolygon[]> {
  return getAreaPolygons(db, ids)
}
