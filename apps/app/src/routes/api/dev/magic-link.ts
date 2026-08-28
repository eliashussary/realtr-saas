import { createFileRoute } from "@tanstack/react-router"

// Dev-only convenience: redirect to the most recently issued magic link so a developer can sign in
// without reading the server terminal. Hard-gated to non-production — this must never be reachable
// in production, where it would be an authentication bypass.
export const Route = createFileRoute("/api/dev/magic-link")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.NODE_ENV === "production") {
          return new Response("Not found", { status: 404 })
        }
        const { getLastDevMagicLink } = await import("../../../lib/auth")
        const url = getLastDevMagicLink()
        if (!url) {
          return new Response("No magic link has been requested yet.", { status: 404 })
        }
        return new Response(null, { status: 302, headers: { location: url } })
      },
    },
  },
})
