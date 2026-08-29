import { Render } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import type { FeaturedListing, TeamAgent } from "@realtr/site/blocks"
import { type SiteDocumentV1, resolveNavigation, resolvePageBySlug } from "@realtr/site/document"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type { CSSProperties } from "react"
import { toListingView } from "./listing-view"
import { buildPageSeo, resolveOrigin, serializeJsonLd } from "./seo"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type PublishedPageData =
  | {
      status: "ok"
      document: Json
      path: string
      revisionId: string
      origin: string
      featured: FeaturedListing[]
      agents: TeamAgent[]
    }
  | { status: "redirect"; href: string; permanent: boolean }
  | { status: "not_found" }
  | { status: "error" }

function toFeatured(row: {
  source: string
  sourceListingId: string
  data: Record<string, unknown>
}): FeaturedListing {
  const view = toListingView(row.data)
  return {
    source: row.source,
    href: `/listings/${encodeURIComponent(row.sourceListingId)}`,
    primaryPhoto: view.primaryPhoto,
    price: view.price,
    address: view.addressLine,
    cityProvince: view.cityProvince,
    beds: view.beds,
    baths: view.baths,
    propertyType: view.propertyType,
  }
}

// Server-only: resolve host -> live published revision -> page. Fail-closed; never serves a draft or
// template default. ETag is the immutable revision id so caches key on content, not host (ADR 0004).
const loadPublishedPage = createServerFn({ method: "GET" })
  .validator((path: string) => path)
  .handler(async ({ data: path }): Promise<PublishedPageData> => {
    const { getRequestHeader, setResponseStatus, setResponseHeader } = await import(
      "@tanstack/react-start/server"
    )
    const origin = resolveOrigin(
      getRequestHeader("host") ?? "",
      getRequestHeader("x-forwarded-proto"),
    )
    const { resolvePublishedSite, listPublishedListings, listPublishedAgents } = await import(
      "@realtr/core"
    )
    const { resolvePageBySlug: resolvePage } = await import("@realtr/site/document")

    const host = getRequestHeader("host") ?? ""
    const result = await resolvePublishedSite(host)
    if (result.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (result.status === "not_found") {
      setResponseStatus(404)
      return { status: "not_found" }
    }

    const resolution = resolvePage(result.document as unknown as SiteDocumentV1, path)
    if (resolution.kind === "redirect") {
      return { status: "redirect", href: `/${resolution.toSlug}`, permanent: resolution.permanent }
    }
    if (resolution.kind === "not_found") {
      setResponseStatus(404)
      return { status: "not_found" }
    }

    const setHeader = setResponseHeader as (name: string, value: string) => void
    // Content-addressed ETag: identical revisions (e.g. a restore) share it.
    setHeader("ETag", `"${result.checksum}"`)
    setHeader("Cache-Control", "public, max-age=0, must-revalidate")
    // Featured-first active listings for any ListingGrid block on the page. One query; featured
    // curation naturally leads and recent listings backfill so the block is never empty when a
    // tenant has listings but has featured none.
    const listings = await listPublishedListings(result.organizationId, { limit: 12 })
    const featured = listings.map((r) => toFeatured(r))
    const agentRows = await listPublishedAgents(result.organizationId)
    const agents: TeamAgent[] = agentRows.map((a) => ({
      slug: a.slug,
      href: `/agents/${encodeURIComponent(a.slug)}`,
      displayName: a.displayName,
      title: a.title,
      photoUrl: a.photoUrl,
      email: a.email,
      phone: a.phone,
    }))
    return {
      status: "ok",
      document: result.document as Json,
      path,
      revisionId: result.revisionId,
      origin,
      featured,
      agents,
    }
  })

/** Route-loader entry: throws a redirect in the router context, otherwise returns page data. */
export async function loadPublishedRoute(path: string): Promise<PublishedPageData> {
  const data = await loadPublishedPage({ data: path })
  if (data.status === "redirect") {
    throw redirect({ href: data.href, statusCode: data.permanent ? 301 : 302 })
  }
  return data
}

function selectedPage(data: PublishedPageData) {
  if (data.status !== "ok") return null
  const document = data.document as unknown as SiteDocumentV1
  const resolution = resolvePageBySlug(document, data.path)
  return resolution.kind === "page"
    ? { document, page: resolution.page, origin: data.origin }
    : null
}

/** SEO/head meta (title, description, robots, canonical, Open Graph, Twitter) for the page. */
export function publishedHead(data: PublishedPageData | undefined) {
  const selected = data ? selectedPage(data) : null
  if (!selected) return { meta: [{ title: "Not found" }] }
  const { meta, links } = buildPageSeo(selected.document, selected.page, selected.origin)
  return { meta, links }
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
      {message}
    </div>
  )
}

export function PublishedPage({ data }: { data: PublishedPageData }) {
  if (data.status === "error") {
    return <Unavailable message="This site is temporarily unavailable." />
  }

  const selected = selectedPage(data)
  if (!selected) return <Unavailable message="This page could not be found." />

  const { document, page, origin } = selected
  const template = getTemplate(document.template.id)
  const config = template.buildConfig()
  const theme = mergeTheme(template.defaultTheme, document.theme)
  const featured = data.status === "ok" ? data.featured : []
  const agents = data.status === "ok" ? data.agents : []
  // The site menu is document-level; inject it into the page's root props so the template root
  // renders it. Listing/agent data is injected into ListingGrid/Team blocks the same way. All are
  // render-time only — never persisted back into the document.
  const renderData = {
    ...page.puck,
    content: injectBlockData(page.puck.content, featured, agents),
    zones: page.puck.zones
      ? Object.fromEntries(
          Object.entries(page.puck.zones).map(([k, v]) => [
            k,
            injectBlockData(v, featured, agents),
          ]),
        )
      : page.puck.zones,
    root: {
      ...page.puck.root,
      props: { ...page.puck.root?.props, nav: resolveNavigation(document) },
    },
  }
  const { jsonLd } = buildPageSeo(document, page, origin)

  return (
    <div style={themeToCssVars(theme) as CSSProperties}>
      {jsonLd.map((entry) => (
        <script
          key={entry["@type"] as string}
          type="application/ld+json"
          // JSON-LD structured data; `<` is escaped in serializeJsonLd so it cannot break out.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(entry) }}
        />
      ))}
      <Render config={config} data={renderData} />
    </div>
  )
}

type PuckBlock = { type: string; props?: Record<string, unknown> }

/** Inject render-time data into data-backed blocks (ListingGrid, Team); leave others untouched. */
function injectBlockData<T extends PuckBlock>(
  blocks: readonly T[],
  featured: FeaturedListing[],
  agents: TeamAgent[],
): T[] {
  return blocks.map((b) => {
    if (b.type === "ListingGrid") return { ...b, props: { ...b.props, listings: featured } } as T
    if (b.type === "Team") return { ...b, props: { ...b.props, agents } } as T
    return b
  })
}

function mergeTheme(base: ThemeTokens, override: ThemeTokens): ThemeTokens {
  return {
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    radius: override.radius ?? base.radius,
  }
}
