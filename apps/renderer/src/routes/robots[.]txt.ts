import { createFileRoute } from "@tanstack/react-router"
import { resolveOrigin, robotsTxt } from "../seo"

// robots.txt for the host's live published site. Fail-closed: an unknown/unpublished host is 404.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { resolvePublishedSite } = await import("@realtr/core")
        const host = request.headers.get("host") ?? new URL(request.url).host
        const result = await resolvePublishedSite(host)
        if (result.status !== "ok") {
          return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain" },
          })
        }
        const origin = resolveOrigin(host, request.headers.get("x-forwarded-proto"))
        return new Response(robotsTxt(origin), {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
          },
        })
      },
    },
  },
})
