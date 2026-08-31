import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig, svgThumbnail } from "../shared"
import { ClassicRoot } from "./root"

const defaultTheme: ThemeTokens = {
  colors: {
    brand: "oklch(0.45 0.09 40)",
    accent: "oklch(0.6 0.13 30)",
    background: "oklch(0.98 0.01 85)",
    foreground: "oklch(0.25 0.02 60)",
    muted: "oklch(0.5 0.03 60)",
  },
  fonts: {
    heading: "'Times New Roman', Times, serif",
    body: "'Georgia', ui-serif, serif",
  },
  radius: "0",
}

const defaultPages: Pages = {
  "/": {
    root: { props: { title: "Heritage Realty" } },
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-1",
          title: "Timeless homes, trusted guidance",
          subtitle: "A considered, personal approach to buying and selling.",
          ctaLabel: "Browse listings",
          ctaHref: "#listings",
        },
      },
      {
        type: "About",
        props: {
          id: "About-1",
          heading: "About",
          body: "Decades of local expertise, at your service.",
        },
      },
      {
        type: "Contact",
        props: {
          id: "Contact-1",
          heading: "Get in touch",
          email: "hello@heritage-realty.com",
          phone: "(555) 123-4567",
        },
      },
    ],
    zones: {},
  },
}

export const classic: TemplateModule = {
  meta: {
    id: "classic",
    name: "Classic",
    description: "Serif, centered masthead with an editorial feel — timeless and formal.",
    thumbnail: svgThumbnail(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'><rect width='320' height='160' fill='#f7f3ec'/><rect x='60' y='22' width='200' height='8' fill='#5a4632'/><rect x='110' y='36' width='100' height='3' fill='#9b7b4f'/><rect x='80' y='64' width='160' height='10' fill='#3d3227'/><rect x='100' y='86' width='120' height='6' fill='#8a7a63'/><rect x='130' y='116' width='60' height='18' fill='none' stroke='#5a4632' stroke-width='2'/></svg>",
    ),
  },
  schemaVersion: 1,
  Root: ClassicRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () => composeConfig({ root: buildRootConfig(ClassicRoot) }),
}
