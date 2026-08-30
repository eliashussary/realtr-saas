import {
  type ListingFilter,
  type PublishedCollection,
  countPublishedListings,
  listingFilterToQueryString,
  publishedCollectionBySlug,
  publishedCollections,
  publishedListingBounds,
  publishedListingMarkers,
  resolvePublishedSite,
  searchPublishedListings,
} from "@realtr/core"
import type { SiteDocumentV1 } from "@realtr/site/document"
import { createServerFn } from "@tanstack/react-start"
import { type ListingItem, ListingsSearch } from "./listings-render"
import { listingMapStyleUrl } from "./map-style"
import { resolveOrigin } from "./seo"
import { SiteShell } from "./site-shell"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const PAGE_SIZE = 24
const MAP_MARKER_LIMIT = 500

interface CollectionSummary {
  slug: string
  name: string
  description: string
}

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

export type CollectionsIndexData =
  | { status: "ok"; document: Json; origin: string; collections: CollectionSummary[] }
  | { status: "not_found" }
  | { status: "error" }

export type CollectionDetailData =
  | {
      status: "ok"
      document: Json
      origin: string
      collection: CollectionSummary
      filter: ListingFilter
      items: SerializedListing[]
      total: number
      offset: number
      pageSize: number
      markers: Array<{
        sourceListingId: string
        latitude: number
        longitude: number
        listPrice: number | null
      }>
      bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null
      mapStyleUrl: string
    }
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

const loadCollectionsIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<CollectionsIndexData> => {
    const { site, origin, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const rows = await publishedCollections(site.organizationId)
    const collections = rows.map((c: PublishedCollection) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
    }))
    return { status: "ok", document: site.document as Json, origin, collections }
  },
)

const loadCollectionDetail = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<CollectionDetailData> => {
    const { site, origin, url, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const collection = await publishedCollectionBySlug(site.organizationId, slug)
    if (!collection) {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const filter = collection.filter
    const offset = readOffset(url.searchParams)
    const [rows, total, markers, bounds] = await Promise.all([
      searchPublishedListings(site.organizationId, filter, { limit: PAGE_SIZE, offset }),
      countPublishedListings(site.organizationId, filter),
      publishedListingMarkers(site.organizationId, filter, { limit: MAP_MARKER_LIMIT }),
      publishedListingBounds(site.organizationId, filter),
    ])
    return {
      status: "ok",
      document: site.document as Json,
      origin,
      collection: {
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
      },
      filter,
      items: rows.map((r) => ({
        source: r.source,
        sourceListingId: r.sourceListingId,
        data: r.data as unknown as Json,
      })),
      total,
      offset,
      pageSize: PAGE_SIZE,
      markers,
      bounds,
      mapStyleUrl: listingMapStyleUrl(),
    }
  })

export function loadCollectionsIndexRoute(): Promise<CollectionsIndexData> {
  return loadCollectionsIndex()
}
export function loadCollectionDetailRoute(slug: string): Promise<CollectionDetailData> {
  return loadCollectionDetail({ data: slug })
}

function documentOf(data: CollectionsIndexData | CollectionDetailData): SiteDocumentV1 | null {
  return data.status === "ok" ? (data.document as unknown as SiteDocumentV1) : null
}

function siteTitle(document: SiteDocumentV1 | null): string {
  return document?.settings.siteTitle ?? "Collections"
}

export function collectionsIndexHead(data: CollectionsIndexData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Collections" }] }
  const title = `Collections — ${siteTitle(documentOf(data))}`
  return {
    meta: [{ title }, { property: "og:title", content: title }],
    links: [{ rel: "canonical", href: `${data.origin}/collections` }],
  }
}

export function collectionDetailHead(data: CollectionDetailData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Collection not found" }] }
  const title = `${data.collection.name} — ${siteTitle(documentOf(data))}`
  const meta: Array<Record<string, string>> = [{ title }, { property: "og:title", content: title }]
  if (data.collection.description) {
    meta.push({ name: "description", content: data.collection.description })
    meta.push({ property: "og:description", content: data.collection.description })
  }
  return {
    meta,
    links: [{ rel: "canonical", href: `${data.origin}/collections/${data.collection.slug}` }],
  }
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
      {message}
    </div>
  )
}

export function CollectionsIndexPage({ data }: { data: CollectionsIndexData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This page could not be found." />
  const document = documentOf(data) as SiteDocumentV1
  return (
    <SiteShell document={document}>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-heading text-4xl font-bold text-foreground">Collections</h1>
        {data.collections.length === 0 ? (
          <p className="mt-8 text-muted">No collections yet.</p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {data.collections.map((c) => (
              <a
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="rounded-lg border border-muted/20 bg-background p-6 transition-shadow hover:shadow-md"
              >
                <h2 className="font-heading text-xl font-semibold text-foreground">{c.name}</h2>
                {c.description ? <p className="mt-2 text-sm text-muted">{c.description}</p> : null}
                <span className="mt-3 inline-block text-sm font-medium text-brand">
                  View listings →
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  )
}

export function CollectionDetailPage({ data }: { data: CollectionDetailData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This collection could not be found." />
  const document = documentOf(data) as SiteDocumentV1
  const refineHref = (() => {
    const qs = listingFilterToQueryString(data.filter)
    return qs ? `/listings?${qs}` : "/listings"
  })()
  const base = `/collections/${data.collection.slug}`
  return (
    <SiteShell document={document}>
      <ListingsSearch
        items={data.items.map(toItem)}
        filter={data.filter}
        facets={{ propertyTypes: [], cities: [] }}
        areaFacets={[]}
        areaPolygons={[]}
        total={data.total}
        offset={data.offset}
        pageSize={data.pageSize}
        markers={data.markers}
        bounds={data.bounds}
        mapStyleUrl={data.mapStyleUrl}
        heading={data.collection.name}
        description={data.collection.description}
        hideFilter
        refineHref={refineHref}
        paginationHref={(offset) => (offset > 0 ? `${base}?offset=${offset}` : base)}
      />
    </SiteShell>
  )
}
