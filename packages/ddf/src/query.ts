// Minimal OData query builder for the DDF Property/replication endpoints. We build only the small
// set of options Realtr needs rather than pulling an OData query dependency: a modification-timestamp
// delta filter, an optional geographic bounding box, deterministic ordering, and paging.

/** [minLng, minLat, maxLng, maxLat] — the DDF filters on Latitude/Longitude. */
export type BoundingBox = [number, number, number, number]

export interface PropertyQueryOptions {
  /** Only records modified strictly after this instant (incremental delta). */
  since?: Date
  /** Page size; DDF caps `$top` at 100. */
  top?: number
  /** Deterministic ordering — DDF does not guarantee order and may repeat rows across pages. */
  orderby?: string
  bbox?: BoundingBox
  /** Fetch a single listing by its DDF ListingId. */
  listingId?: string
}

const DEFAULT_TOP = 100
const MAX_TOP = 100
const DEFAULT_ORDERBY = "ModificationTimestamp,ListingKey"

function encodeParams(params: Array<[string, string]>): string {
  return params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
}

function buildFilter(options: {
  since?: Date
  bbox?: BoundingBox
  listingId?: string
}): string | undefined {
  const clauses: string[] = []
  if (options.listingId) clauses.push(`ListingId eq '${options.listingId.replace(/'/g, "''")}'`)
  if (options.since) clauses.push(`ModificationTimestamp gt ${options.since.toISOString()}`)
  if (options.bbox) {
    const [minLng, minLat, maxLng, maxLat] = options.bbox
    clauses.push(
      `Latitude gt ${minLat}`,
      `Latitude lt ${maxLat}`,
      `Longitude gt ${minLng}`,
      `Longitude lt ${maxLng}`,
    )
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined
}

/** Build the querystring (no leading `?`) for a Property collection request. */
export function buildPropertyQuery(options: PropertyQueryOptions = {}): string {
  const params: Array<[string, string]> = []
  const filter = buildFilter(options)
  if (filter) params.push(["$filter", filter])
  params.push(["$orderby", options.orderby ?? DEFAULT_ORDERBY])
  params.push(["$top", String(Math.min(options.top ?? DEFAULT_TOP, MAX_TOP))])
  return encodeParams(params)
}

/** Build the querystring (no leading `?`) for a PropertyReplication request. */
export function buildReplicationQuery(options: { since?: Date; top?: number } = {}): string {
  const params: Array<[string, string]> = []
  if (options.since)
    params.push(["$filter", `ModificationTimestamp gt ${options.since.toISOString()}`])
  params.push(["$top", String(Math.min(options.top ?? DEFAULT_TOP, MAX_TOP))])
  return encodeParams(params)
}
