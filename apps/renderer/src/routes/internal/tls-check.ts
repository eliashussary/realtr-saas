import { createFileRoute } from "@tanstack/react-router"

// Backs Caddy on-demand TLS: `ask http://renderer:3000/internal/tls-check`.
// Caddy appends ?domain=<host>; we return 200 only for domains we're willing to serve
// a cert for (prevents random domains pointed at our IP from triggering issuance).
export const Route = createFileRoute("/internal/tls-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isServableDomain } = await import("@realtr/core")
        const domain = new URL(request.url).searchParams.get("domain") ?? ""
        const ok = domain.length > 0 && (await isServableDomain(domain))
        return new Response(ok ? "ok" : "denied", {
          status: ok ? 200 : 404,
          headers: { "content-type": "text/plain" },
        })
      },
    },
  },
})
