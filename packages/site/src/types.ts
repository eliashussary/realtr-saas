import type { Config, Data } from "@measured/puck"
import type { ThemeTokens } from "@realtr/ui/tokens"
import type { ComponentType, ReactNode } from "react"

/** Puck page document. A site stores one of these per route path. */
export type PageData = Data
export type Pages = Record<string, PageData>

export interface TemplateMeta {
  id: string
  name: string
  description?: string
  thumbnail?: string
}

/**
 * An installable template. `buildConfig()` yields the Puck Config shared by the editor
 * (`<Puck>`) and the renderer (`<Render>`); `Root` is the layout wrapper (also wired as
 * the Puck root render inside buildConfig). `defaultTheme`/`defaultPages` seed a new site.
 */
export interface TemplateModule {
  meta: TemplateMeta
  /** Realtr's persisted template/content compatibility version. */
  schemaVersion: number
  Root: ComponentType<{ children: ReactNode; title?: string }>
  defaultTheme: ThemeTokens
  defaultPages: Pages
  buildConfig: () => Config
}
