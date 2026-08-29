import { createFileRoute } from "@tanstack/react-router"

// Public lead capture endpoint. Native form POST (no client JS required): store-before-deliver, then
// Post/Redirect/Get back to the originating page with a status flag the Contact block reflects.
export const Route = createFileRoute("/api/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { captureLead } = await import("@realtr/core")
        const host = request.headers.get("host") ?? new URL(request.url).host
        const form = await request.formData()
        const str = (k: string) => {
          const v = form.get(k)
          return typeof v === "string" ? v : undefined
        }

        // Where to send the user back: the form's own page, else the Referer's path, else "/".
        const refererPath = (() => {
          const ref = request.headers.get("referer")
          if (!ref) return undefined
          try {
            const u = new URL(ref)
            return `${u.pathname}${u.search}`
          } catch {
            return undefined
          }
        })()
        const back = (flag: string) => {
          // Rebuild the return URL so a resubmit doesn't stack ?contacted params.
          const u = new URL(str("pagePath") ?? refererPath ?? "/", "http://x")
          u.searchParams.set("contacted", flag)
          return new Response(null, {
            status: 303,
            headers: { location: `${u.pathname}${u.search}#contact` },
          })
        }

        const result = await captureLead({
          host,
          source: str("source"),
          name: str("name"),
          email: str("email"),
          phone: str("phone"),
          message: str("message"),
          consent: str("consent") === "on" || str("consent") === "true",
          listingRef: str("listingRef") ?? null,
          pagePath: str("pagePath") ?? refererPath ?? null,
          trap: str("company"), // honeypot field named to bait autofill bots
          ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || undefined,
        })

        if (result.status === "ok" || result.status === "dropped") return back("1")
        if (result.status === "invalid") return back("invalid")
        if (result.status === "not_found") return back("1") // don't leak tenant existence
        return back("error")
      },
    },
  },
})
