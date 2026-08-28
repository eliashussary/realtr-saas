import { Render } from "@measured/puck"
import type { Data } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type { CSSProperties } from "react"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

// Minimal shape the renderer reads out of a resolved SiteDocumentV1 revision.
interface PreviewPage {
  slug: string
  title: string
  puck: Data
}
interface PreviewDocument {
  template: { id: string }
  theme: ThemeTokens
  settings: { siteTitle: string }
  pages: PreviewPage[]
}

// Server-only: resolve the opaque token to an immutable revision. Preview responses are never
// cacheable or indexable and must not leak the token through the Referer header (ADR 0004).
const loadPreview = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(async ({ data: token }): Promise<{ document: Json } | null> => {
    const { resolvePreview } = await import("@realtr/core")
    const { setResponseHeader, setResponseStatus } = await import("@tanstack/react-start/server")
    const setHeader = setResponseHeader as (name: string, value: string) => void
    setHeader("Cache-Control", "private, no-store")
    setHeader("Pragma", "no-cache")
    setHeader("X-Robots-Tag", "noindex, nofollow, noarchive")
    setHeader("Referrer-Policy", "no-referrer")

    const document = await resolvePreview(token)
    if (!document) {
      setResponseStatus(404)
      return null
    }
    return { document: document as Json }
  })

export const Route = createFileRoute("/preview/$token")({
  loader: ({ params }) => loadPreview({ data: params.token }),
  head: () => ({ meta: [{ title: "Preview" }] }),
  component: PreviewPage,
})

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
      {message}
    </div>
  )
}

function PreviewPage() {
  const data = Route.useLoaderData()
  if (!data) return <Unavailable message="This preview link is invalid or has expired." />

  // The document was validated when the preview was issued; render defensively regardless.
  const document = data.document as unknown as PreviewDocument
  const template = getTemplate(document.template.id)
  const config = template.buildConfig()
  const home = document.pages.find((page) => page.slug === "") ?? document.pages[0]
  if (!home) return <Unavailable message="This preview has no pages to display." />

  return (
    <div style={themeToCssVars(document.theme) as CSSProperties}>
      <Render config={config} data={home.puck} />
    </div>
  )
}
