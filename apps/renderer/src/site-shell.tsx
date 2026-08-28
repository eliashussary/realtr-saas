import { getTemplate } from "@realtr/site"
import { type SiteDocumentV1, resolveNavigation } from "@realtr/site/document"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import type { CSSProperties, ComponentType, ReactNode } from "react"

function mergeTheme(base: ThemeTokens, override: ThemeTokens): ThemeTokens {
  return {
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    radius: override.radius ?? base.radius,
  }
}

type ShellRoot = ComponentType<{
  children: ReactNode
  title?: string
  nav?: Array<{ id: string; label: string; href: string }>
}>

/**
 * Render arbitrary content inside a tenant's themed template shell (header/nav/footer), for pages
 * that aren't Puck documents — e.g. the listing routes. Mirrors the theme + navigation the published
 * renderer applies to document pages.
 */
export function SiteShell({
  document,
  children,
}: {
  document: SiteDocumentV1
  children: ReactNode
}) {
  const template = getTemplate(document.template.id)
  const Root = template.Root as ShellRoot
  const theme = mergeTheme(template.defaultTheme, document.theme)
  return (
    <div style={themeToCssVars(theme) as CSSProperties}>
      <Root title={document.settings.siteTitle} nav={resolveNavigation(document)}>
        {children}
      </Root>
    </div>
  )
}
