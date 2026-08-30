// The canonical listing-search filter: the single source of truth for what the public property
// search can filter on. Shared by the renderer (URL <-> filter), the query layer (@realtr/db), and
// saved collections (which persist exactly this shape in a jsonb column). Kept strictly
// JSON-serializable so it round-trips through server-fn payloads and the collection `filter` column
// unchanged.
//
// Design mirrors the original realtr app: the URL is the source of truth, arrays serialize as
// repeated keys, and a collection is just a named, stored filter. Beds/baths are "at least" (the
// portal convention), unlike realtr's exact-or-plus strings.

export type ListingSort = "newest" | "price_asc" | "price_desc"

const SORTS: readonly ListingSort[] = ["newest", "price_asc", "price_desc"]

export interface ListingFilter {
  minPrice?: number
  maxPrice?: number
  minBeds?: number // at least N bedrooms
  minBaths?: number // at least N bathrooms
  propertyType?: string[]
  city?: string[]
  areaIds?: string[] // neighbourhood polygons; the query layer joins these against PostGIS areas
  sort?: ListingSort
}

/** The query keys this filter owns in a URL — everything else (pagination, etc.) is left untouched. */
export const LISTING_FILTER_KEYS = [
  "minPrice",
  "maxPrice",
  "minBeds",
  "minBaths",
  "propertyType",
  "city",
  "areaIds",
  "sort",
] as const

function posInt(value: string | null): number | undefined {
  // A blank string (an empty number input in a GET form) is "no value" — guard it, since Number("")
  // is 0, not NaN, which would otherwise smuggle a spurious 0 into the filter.
  if (value === null || value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

function cleanStrings(values: string[]): string[] | undefined {
  const out = Array.from(new Set(values.map((v) => v.trim()).filter((v) => v !== "")))
  return out.length > 0 ? out : undefined
}

/** Read a filter out of URL search params. Unknown/malformed values are dropped, never thrown. */
export function parseListingFilter(params: URLSearchParams): ListingFilter {
  const filter: ListingFilter = {}
  const minPrice = posInt(params.get("minPrice"))
  const maxPrice = posInt(params.get("maxPrice"))
  const minBeds = posInt(params.get("minBeds"))
  const minBaths = posInt(params.get("minBaths"))
  if (minPrice !== undefined) filter.minPrice = minPrice
  if (maxPrice !== undefined) filter.maxPrice = maxPrice
  if (minBeds !== undefined) filter.minBeds = minBeds
  if (minBaths !== undefined) filter.minBaths = minBaths
  const propertyType = cleanStrings(params.getAll("propertyType"))
  const city = cleanStrings(params.getAll("city"))
  const areaIds = cleanStrings(params.getAll("areaIds"))
  if (propertyType) filter.propertyType = propertyType
  if (city) filter.city = city
  if (areaIds) filter.areaIds = areaIds
  const sort = params.get("sort")
  if (sort && (SORTS as readonly string[]).includes(sort)) filter.sort = sort as ListingSort
  return filter
}

/** Serialize a filter to URL search params — arrays become repeated keys, empties omitted. */
export function listingFilterToSearchParams(filter: ListingFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.minPrice !== undefined) params.set("minPrice", String(filter.minPrice))
  if (filter.maxPrice !== undefined) params.set("maxPrice", String(filter.maxPrice))
  if (filter.minBeds !== undefined) params.set("minBeds", String(filter.minBeds))
  if (filter.minBaths !== undefined) params.set("minBaths", String(filter.minBaths))
  for (const v of filter.propertyType ?? []) params.append("propertyType", v)
  for (const v of filter.city ?? []) params.append("city", v)
  for (const v of filter.areaIds ?? []) params.append("areaIds", v)
  if (filter.sort) params.set("sort", filter.sort)
  return params
}

/** Convenience: a stable querystring for links (sorted keys so equal filters share a URL/cache key). */
export function listingFilterToQueryString(filter: ListingFilter): string {
  const params = listingFilterToSearchParams(filter)
  params.sort()
  return params.toString()
}

/** True when the filter narrows nothing (sort alone does not count as a narrowing filter). */
export function isEmptyListingFilter(filter: ListingFilter): boolean {
  return (
    filter.minPrice === undefined &&
    filter.maxPrice === undefined &&
    filter.minBeds === undefined &&
    filter.minBaths === undefined &&
    !filter.propertyType?.length &&
    !filter.city?.length &&
    !filter.areaIds?.length
  )
}
