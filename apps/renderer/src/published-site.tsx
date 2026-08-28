import { Render } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { type SiteDocumentV1, resolveNavigation, resolvePageBySlug } from "@realtr/site/document"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type { CSSProperties } from "react"
import { buildPageSeo, resolveOrigin, serializeJsonLd } from "./seo"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type PublishedPageData =
  | { status: "ok"; document: Json; path: string; revisionId: string; origin: string }
  | { status: "redirect"; href: string; permanent: boolean }
  | { status: "not_found" }
  | { status: "error" }

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
    const { resolvePublishedSite } = await import("@realtr/core")
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
    return {
      status: "ok",
      document: result.document as Json,
      path,
      revisionId: result.revisionId,
      origin,
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
  // The site menu is document-level; inject it into the page's root props so the template root
  // renders it. This is render-time only — it is never persisted back into the document.
  const renderData = {
    ...page.puck,
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

function mergeTheme(base: ThemeTokens, override: ThemeTokens): ThemeTokens {
  return {
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    radius: override.radius ?? base.radius,
  }
}
