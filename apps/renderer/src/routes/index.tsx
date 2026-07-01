import { Render } from "@measured/puck"
import type { Data } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import type { CSSProperties } from "react"

// Server-only: read the request Host, resolve the tenant site. createServerFn keeps the
// DB/pg imports out of the client bundle.
const resolveTenant = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server")
  const { resolveSiteByHost } = await import("@realtr/core")
  const host = getRequestHeader("host") ?? ""
  const resolved = await resolveSiteByHost(host)
  if (!resolved) return null
  return {
    templateId: resolved.site.templateId,
    theme: (resolved.site.theme ?? {}) as ThemeTokens,
    pages: (resolved.site.pages ?? {}) as Record<string, Data>,
    orgName: resolved.organization.name,
  }
})

function mergeTheme(base: ThemeTokens, override: ThemeTokens): ThemeTokens {
  return {
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    radius: override.radius ?? base.radius,
  }
}

export const Route = createFileRoute("/")({
  loader: () => resolveTenant(),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.orgName ?? "Realtr" }],
  }),
  component: TenantPage,
})

function TenantPage() {
  const data = Route.useLoaderData()

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
        No site is configured for this domain.
      </div>
    )
  }

  const template = getTemplate(data.templateId)
  const config = template.buildConfig()
  const theme = mergeTheme(template.defaultTheme, data.theme)
  const page = data.pages["/"] ?? template.defaultPages["/"]

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
        This site has no home page yet.
      </div>
    )
  }

  return (
    <div style={themeToCssVars(theme) as CSSProperties}>
      <Render config={config} data={page} />
    </div>
  )
}
