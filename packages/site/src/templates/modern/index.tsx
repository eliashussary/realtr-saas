import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig, svgThumbnail } from "../shared"
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
  meta: {
    id: "modern",
    name: "Modern",
    description: "Clean, sans-serif layout with a split header — a contemporary agent site.",
    thumbnail: svgThumbnail(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'><rect width='320' height='160' fill='#fafafa'/><rect x='24' y='16' width='90' height='10' rx='5' fill='#c7c9d9'/><circle cx='284' cy='21' r='5' fill='#4f46e5'/><rect x='24' y='56' width='150' height='14' rx='7' fill='#1f2437'/><rect x='24' y='80' width='110' height='8' rx='4' fill='#8a8fa3'/><rect x='24' y='112' width='70' height='22' rx='11' fill='#4f46e5'/></svg>",
    ),
  },
  schemaVersion: 1,
  Root: ModernRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () => composeConfig({ root: buildRootConfig(ModernRoot) }),
}
