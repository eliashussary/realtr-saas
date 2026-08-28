import type { SiteDocumentV1 } from "@realtr/site/document"

type Page = SiteDocumentV1["pages"][number]

/** Build the absolute origin for a request, honoring a proxy's forwarded protocol. */
export function resolveOrigin(host: string, forwardedProto?: string | null): string {
  const proto =
    forwardedProto?.split(",")[0]?.trim() ||
    (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https")
  return `${proto}://${host}`
}

/** Absolute URL for a page slug ("" is the home page). */
export function pageUrl(origin: string, slug: string): string {
  return slug === "" ? `${origin}/` : `${origin}/${encodeURI(slug)}`
}

export interface PageSeo {
  meta: Array<Record<string, string>>
  links: Array<Record<string, string>>
  jsonLd: Array<Record<string, unknown>>
}

/**
 * Derive head metadata (title, description, robots, canonical, Open Graph, Twitter) and JSON-LD
 * structured data for one published page. Only fields that are actually set are emitted.
 */
export function buildPageSeo(document: SiteDocumentV1, page: Page, origin: string): PageSeo {
  const siteTitle = document.settings.siteTitle
  const title = page.seo.title ?? page.title ?? siteTitle
  const description = page.seo.description
  const canonical = pageUrl(origin, page.slug)
  const noIndex = page.seo.noIndex === true

  const meta: Array<Record<string, string>> = [{ title }]
  if (description) meta.push({ name: "description", content: description })
  if (noIndex) meta.push({ name: "robots", content: "noindex, nofollow" })

  // Open Graph + Twitter. og:url is the canonical page URL; og:site_name is the site title.
  meta.push(
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: siteTitle },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
  )
  if (description) {
    meta.push(
      { property: "og:description", content: description },
      { name: "twitter:description", content: description },
    )
  }

  const links: Array<Record<string, string>> = [{ rel: "canonical", href: canonical }]

  return { meta, links, jsonLd: buildJsonLd(document, page, origin) }
}

function buildJsonLd(
  document: SiteDocumentV1,
  page: Page,
  origin: string,
): Array<Record<string, unknown>> {
  const siteTitle = document.settings.siteTitle
  const graph: Array<Record<string, unknown>> = [
    { "@context": "https://schema.org", "@type": "WebSite", name: siteTitle, url: `${origin}/` },
  ]

  // The home page also describes the realtor/agency itself.
  if (page.slug === "") {
    const agent: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: siteTitle,
      url: `${origin}/`,
    }
    const { email, phone } = document.settings.contact
    if (email) agent.email = email
    if (phone) agent.telephone = phone
    const sameAs = document.settings.socialLinks.map((link) => link.url)
    if (sameAs.length > 0) agent.sameAs = sameAs
    graph.push(agent)
  }

  return graph
}

/** Serialize a JSON-LD object for inline `<script>`, escaping `<` so it cannot break out. */
export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Build a sitemap for the site's publicly indexable pages (active and not noindex). */
export function sitemapXml(document: SiteDocumentV1, origin: string): string {
  const urls = document.pages
    .filter((page) => page.status === "active" && page.seo.noIndex !== true)
    .map((page) => `  <url><loc>${escapeXml(pageUrl(origin, page.slug))}</loc></url>`)
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/** robots.txt allowing crawl and pointing at the sitemap. */
export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
}
