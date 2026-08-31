import {
  type AreaPolygon,
  type CuratedArea,
  type ListingBounds,
  type ListingFacets,
  type ListingFilter,
  type ListingMarker,
  countPublishedListings,
  getPublishedListing,
  parseListingFilter,
  publishedAreaFacets,
  publishedAreaPolygons,
  publishedListingBounds,
  publishedListingFacets,
  publishedListingMarkers,
  resolvePublishedSite,
  searchPublishedListings,
} from "@realtr/core"
import type { SiteDocumentV1 } from "@realtr/site/document"
import { createServerFn } from "@tanstack/react-start"
import { toListingView } from "./listing-view"
import { ListingDetail, type ListingItem, ListingsSearch } from "./listings-render"
import { listingMapStyleUrl } from "./map-style"
import { resolveOrigin, serializeJsonLd } from "./seo"
import { SiteShell } from "./site-shell"

// Public search page size. A filtered page returns this many, with prev/next paging by offset.
const PAGE_SIZE = 24
// The map plots every match in the filter (not just the current page), capped for payload sanity.
const MAP_MARKER_LIMIT = 500

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

// Server-fn payloads must be serializable, so listing data crosses as `Json` and is cast back to a
// plain record at the render boundary.
interface SerializedListing {
  source: string
  sourceListingId: string
  data: Json
}

function toItem(listing: SerializedListing): ListingItem {
  return {
    source: listing.source,
    sourceListingId: listing.sourceListingId,
    data: listing.data as Record<string, unknown>,
  }
}

export type ListingsGridData =
  | {
      status: "ok"
      document: Json
      items: SerializedListing[]
      origin: string
      filter: ListingFilter
      facets: ListingFacets
      total: number
      offset: number
      pageSize: number
      markers: ListingMarker[]
      bounds: ListingBounds | null
      mapStyleUrl: string
      areaFacets: CuratedArea[]
      areaPolygons: AreaPolygon[]
    }
  | { status: "not_found" }
  | { status: "error" }

export type ListingDetailData =
  | { status: "ok"; document: Json; item: SerializedListing; origin: string }
  | { status: "not_found" }
  | { status: "error" }

async function resolveHost() {
  const { getRequest, getRequestHeader, setResponseStatus } = await import(
    "@tanstack/react-start/server"
  )
  const host = getRequestHeader("host") ?? ""
  const origin = resolveOrigin(host, getRequestHeader("x-forwarded-proto"))
  const site = await resolvePublishedSite(host)
  return {
    site,
    origin,
    url: new URL(getRequest().url),
    setResponseStatus: setResponseStatus as (status: number) => void,
  }
}

function readOffset(params: URLSearchParams): number {
  const n = Number(params.get("offset"))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const loadListingsGrid = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListingsGridData> => {
    const { site, origin, url, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    // The URL is the source of truth: parse the same filter shape the FilterBar serializes.
    const params = url.searchParams
    const filter = parseListingFilter(params)
    const offset = readOffset(params)
    const [rows, total, facets, markers, bounds, areaFacets, areaPolygons] = await Promise.all([
      searchPublishedListings(site.organizationId, filter, { limit: PAGE_SIZE, offset }),
      countPublishedListings(site.organizationId, filter),
      publishedListingFacets(site.organizationId),
      publishedListingMarkers(site.organizationId, filter, { limit: MAP_MARKER_LIMIT }),
      publishedListingBounds(site.organizationId, filter),
      publishedAreaFacets(site.organizationId),
      // Only fetch outline polygons for the areas actually selected — nothing to draw otherwise.
      filter.areaIds?.length ? publishedAreaPolygons(filter.areaIds) : Promise.resolve([]),
    ])
    const items: SerializedListing[] = rows.map((row) => ({
      source: row.source,
      sourceListingId: row.sourceListingId,
      // SAFETY: row.data is a plain normalized-listing record (from the DB); Json is the serializable
      // server-fn mirror of that same shape, so the cast only narrows the declared type.
      data: row.data as unknown as Json,
    }))
    return {
      status: "ok",
      document: site.document as Json,
      items,
      origin,
      filter,
      facets,
      total,
      offset,
      pageSize: PAGE_SIZE,
      markers,
      bounds,
      mapStyleUrl: listingMapStyleUrl(),
      areaFacets,
      areaPolygons,
    }
  },
)

const loadListingDetail = createServerFn({ method: "GET" })
  .validator((sourceListingId: string) => sourceListingId)
  .handler(async ({ data: sourceListingId }): Promise<ListingDetailData> => {
    const { site, origin, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const row = await getPublishedListing(site.organizationId, sourceListingId)
    if (!row) {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    return {
      status: "ok",
      document: site.document as Json,
      item: {
        source: row.source,
        sourceListingId: row.sourceListingId,
        // SAFETY: row.data is a plain normalized-listing record from the DB; Json mirrors that shape.
        data: row.data as unknown as Json,
      },
      origin,
    }
  })

export function loadListingsGridRoute(): Promise<ListingsGridData> {
  return loadListingsGrid()
}

export function loadListingDetailRoute(sourceListingId: string): Promise<ListingDetailData> {
  return loadListingDetail({ data: sourceListingId })
}

function documentOf(data: ListingsGridData | ListingDetailData): SiteDocumentV1 | null {
  // SAFETY: a published site's document is stored as a validated SiteDocumentV1; it crosses the
  // server-fn boundary as Json and is re-cast to its known shape here.
  return data.status === "ok" ? (data.document as unknown as SiteDocumentV1) : null
}

function siteTitle(document: SiteDocumentV1 | null): string {
  return document?.settings.siteTitle ?? "Listings"
}

export function listingsGridHead(data: ListingsGridData | undefined) {
  const document = data ? documentOf(data) : null
  if (!data || data.status !== "ok") return { meta: [{ title: "Listings" }] }
  const title = `Listings — ${siteTitle(document)}`
  return {
    meta: [{ title }, { property: "og:title", content: title }],
    links: [{ rel: "canonical", href: `${data.origin}/listings` }],
  }
}

export function listingDetailHead(data: ListingDetailData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Listing not found" }] }
  const document = documentOf(data)
  const view = toListingView(toItem(data.item).data)
  const name = view.addressLine ?? view.price ?? "Listing"
  const title = `${name} — ${siteTitle(document)}`
  const meta: Array<Record<string, string>> = [
    { title },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
  ]
  if (view.remarks) {
    meta.push(
      { name: "description", content: view.remarks.slice(0, 300) },
      { property: "og:description", content: view.remarks.slice(0, 300) },
    )
  }
  if (view.primaryPhoto) meta.push({ property: "og:image", content: view.primaryPhoto })
  return {
    meta,
    links: [
      {
        rel: "canonical",
        href: `${data.origin}/listings/${encodeURIComponent(data.item.sourceListingId)}`,
      },
    ],
  }
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
      {message}
    </div>
  )
}

export function ListingsGridPage({ data }: { data: ListingsGridData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This page could not be found." />
  // SAFETY: a published site's document is a stored, validated SiteDocumentV1; re-cast from the
  // Json server-fn payload at the render boundary.
  const document = data.document as unknown as SiteDocumentV1
  return (
    <SiteShell document={document}>
      <ListingsSearch
        items={data.items.map(toItem)}
        filter={data.filter}
        facets={data.facets}
        total={data.total}
        offset={data.offset}
        pageSize={data.pageSize}
        markers={data.markers}
        bounds={data.bounds}
        mapStyleUrl={data.mapStyleUrl}
        areaFacets={data.areaFacets}
        areaPolygons={data.areaPolygons}
      />
    </SiteShell>
  )
}

export function ListingDetailPage({ data }: { data: ListingDetailData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This listing could not be found." />
  // SAFETY: a published site's document is a stored, validated SiteDocumentV1; re-cast from the
  // Json server-fn payload at the render boundary.
  const document = data.document as unknown as SiteDocumentV1
  const item = toItem(data.item)
  const view = toListingView(item.data)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: view.addressLine ?? "Listing",
    ...(view.remarks ? { description: view.remarks } : {}),
    ...(view.primaryPhoto ? { image: view.primaryPhoto } : {}),
    ...(view.priceValue !== null
      ? { offers: { "@type": "Offer", price: view.priceValue, priceCurrency: "CAD" } }
      : {}),
  }
  return (
    <SiteShell document={document}>
      {/* JSON-LD; `<` escaped in serializeJsonLd so it cannot break out. */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ListingDetail item={item} />
    </SiteShell>
  )
}
