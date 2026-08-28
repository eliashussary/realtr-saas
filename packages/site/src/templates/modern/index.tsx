import type { ThemeTokens } from "@realtr/ui/tokens"
import type { ReactNode } from "react"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { ModernRoot } from "./root"

const defaultTheme: ThemeTokens = {
  colors: {
    brand: "oklch(0.55 0.2 255)",
    accent: "oklch(0.75 0.17 70)",
    background: "oklch(1 0 0)",
    foreground: "oklch(0.2 0.02 260)",
    muted: "oklch(0.55 0.02 260)",
  },
  fonts: {
    heading: "'Georgia', ui-serif, serif",
    body: "ui-sans-serif, system-ui, sans-serif",
  },
  radius: "0.75rem",
}

const defaultPages: Pages = {
  "/": {
    root: { props: { title: "Demo Realty" } },
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-1",
          title: "Boutique real estate, done right",
          subtitle: "Browse curated listings with a high-touch, personal experience.",
          ctaLabel: "View listings",
          ctaHref: "#listings",
        },
      },
      {
        type: "ListingGrid",
        props: { id: "ListingGrid-1", heading: "Featured listings", count: 6 },
      },
      {
        type: "Contact",
        props: {
          id: "Contact-1",
          heading: "Get in touch",
          email: "hello@demo-realty.com",
          phone: "(555) 123-4567",
        },
      },
    ],
    zones: {},
  },
}

export const modern: TemplateModule = {
  meta: { id: "modern", name: "Modern" },
  schemaVersion: 1,
  Root: ModernRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () =>
    composeConfig({
      root: {
        fields: { title: { type: "text" } },
        defaultProps: { title: "Realtr" },
        // `nav` is injected at render time by the renderer (document-level navigation), not a Puck
        // field, so it is read off the props bag rather than declared in `fields`.
        render: (props) => {
          const { children, title, nav } = props as {
            children?: ReactNode
            title?: string
            nav?: Array<{ id: string; label: string; href: string }>
          }
          return (
            <ModernRoot title={title} nav={nav}>
              {children}
            </ModernRoot>
          )
        },
      },
    }),
}
