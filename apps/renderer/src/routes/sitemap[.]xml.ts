import type { SiteDocumentV1 } from "@realtr/site/document"
import { createFileRoute } from "@tanstack/react-router"
import { resolveOrigin, sitemapXml } from "../seo"

// XML sitemap for the host's live published site. Fail-closed: an unknown/unpublished host is 404.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { resolvePublishedSite, listPublishedBlogPosts, publishedCollections } = await import(
          "@realtr/core"
        )
        const host = request.headers.get("host") ?? new URL(request.url).host
        const result = await resolvePublishedSite(host)
        if (result.status !== "ok") {
          return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain" },
          })
        }
        const origin = resolveOrigin(host, request.headers.get("x-forwarded-proto"))
        // Include the blog index + each published, indexable post.
        const posts = await listPublishedBlogPosts(result.organizationId)
        const collections = await publishedCollections(result.organizationId)
        const extraPaths = [
          "/blog",
          ...posts.filter((p) => !p.noIndex).map((p) => `/blog/${p.slug}`),
          "/listings",
          "/collections",
          ...collections.map((c) => `/collections/${c.slug}`),
        ]
        const xml = sitemapXml(result.document as unknown as SiteDocumentV1, origin, extraPaths)
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
          },
        })
      },
    },
  },
})
