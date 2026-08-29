import { getPublishedListing, listPublishedListings, resolvePublishedSite } from "@realtr/core"
import type { SiteDocumentV1 } from "@realtr/site/document"
import { createServerFn } from "@tanstack/react-start"
import { toListingView } from "./listing-view"
import { ListingDetail, type ListingItem, ListingsGrid } from "./listings-render"
import { resolveOrigin, serializeJsonLd } from "./seo"
import { SiteShell } from "./site-shell"

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
  | { status: "ok"; document: Json; items: SerializedListing[]; origin: string }
  | { status: "not_found" }
  | { status: "error" }

export type ListingDetailData =
  | { status: "ok"; document: Json; item: SerializedListing; origin: string }
  | { status: "not_found" }
  | { status: "error" }

async function resolveHost() {
  const { getRequestHeader, setResponseStatus } = await import("@tanstack/react-start/server")
  const host = getRequestHeader("host") ?? ""
  const origin = resolveOrigin(host, getRequestHeader("x-forwarded-proto"))
  const site = await resolvePublishedSite(host)
  return { site, origin, setResponseStatus: setResponseStatus as (status: number) => void }
}

const loadListingsGrid = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListingsGridData> => {
    const { site, origin, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const rows = await listPublishedListings(site.organizationId, { limit: 60 })
    const items: SerializedListing[] = rows.map((row) => ({
      source: row.source,
      sourceListingId: row.sourceListingId,
      data: row.data as unknown as Json,
    }))
    return { status: "ok", document: site.document as Json, items, origin }
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
  const document = data.document as unknown as SiteDocumentV1
  return (
    <SiteShell document={document}>
      <ListingsGrid items={data.items.map(toItem)} />
    </SiteShell>
  )
}

export function ListingDetailPage({ data }: { data: ListingDetailData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This listing could not be found." />
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
