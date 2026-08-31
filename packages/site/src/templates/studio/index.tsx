import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig, svgThumbnail } from "../shared"
import { studioBlocks } from "./blocks"
import { StudioRoot } from "./root"

const defaultTheme: ThemeTokens = {
  colors: {
    brand: "oklch(0.55 0.23 265)",
    accent: "oklch(0.85 0.16 100)",
    background: "oklch(0.99 0 0)",
    foreground: "oklch(0.16 0.01 260)",
    muted: "oklch(0.45 0.01 260)",
  },
  fonts: {
    heading: '"Futura", "Futura PT", "Avenir Next", "Century Gothic", "Segoe UI", sans-serif',
    body: '"Helvetica Neue", "Helvetica", "Segoe UI", system-ui, sans-serif',
  },
  radius: "0px",
}

const defaultPages: Pages = {
  "/": {
    root: { props: { title: "Northline Studio" } },
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-1",
          title: "Homes that make a statement.",
          subtitle:
            "A listing studio for people who take their property as seriously as the rest of their lives. Sharp pricing, sharper marketing, and a process built for speed.",
          ctaLabel: "See what's live",
          ctaHref: "#listings",
        },
      },
      {
        type: "About",
        props: {
          id: "About-1",
          heading: "No scripts. No small talk.",
          body: "We treat every listing like a launch: photographed properly, priced from data, and marketed with intent. You'll know where your property stands at every step — numbers included.\n\nBuyers get the same deal: honest comps, fast decisions, and zero theatre.",
        },
      },
      {
        type: "ListingGrid",
        props: {
          id: "ListingGrid-1",
          heading: "Live right now",
          count: 6,
        },
      },
      {
        type: "Contact",
        props: {
          id: "Contact-1",
          heading: "Let's talk numbers",
          email: "hello@northline.studio",
          phone: "(555) 123-4567",
        },
      },
    ],
    zones: {},
  },
}

export const studio: TemplateModule = {
  meta: {
    id: "studio",
    name: "Studio",
    description: "Bold type, sharp edges, one loud accent — a design-studio attitude.",
    thumbnail: svgThumbnail(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'><rect width='320' height='160' fill='#ffffff'/><rect width='320' height='6' fill='#111318'/><rect x='24' y='36' width='150' height='16' fill='#111318'/><rect x='24' y='60' width='90' height='8' fill='#5c6270'/><rect x='0' y='100' width='200' height='60' fill='#2743e0'/><rect x='200' y='100' width='120' height='60' fill='#d7e34a'/></svg>",
    ),
  },
  schemaVersion: 1,
  Root: StudioRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () =>
    composeConfig({ root: buildRootConfig(StudioRoot), renderOverrides: studioBlocks }),
}
