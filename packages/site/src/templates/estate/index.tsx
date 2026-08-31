import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig, svgThumbnail } from "../shared"
import { estateBlocks } from "./blocks"
import { EstateRoot } from "./root"

const defaultTheme: ThemeTokens = {
  colors: {
    brand: "oklch(0.78 0.09 82)",
    accent: "oklch(0.72 0.06 60)",
    background: "oklch(0.16 0.012 60)",
    foreground: "oklch(0.93 0.008 85)",
    muted: "oklch(0.64 0.012 75)",
  },
  fonts: {
    heading: '"Didot", "Bodoni MT", "Cochin", "Times New Roman", serif',
    body: '"Avenir Next", "Avenir", "Segoe UI", system-ui, sans-serif',
  },
  radius: "0px",
}

const defaultPages: Pages = {
  "/": {
    root: { props: { title: "Meridian Estate" } },
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-1",
          title: "Quiet streets. Extraordinary homes.",
          subtitle:
            "A private brokerage for exceptional properties and the clients who find them — discreet counsel, precise pricing, and results that speak for themselves.",
          ctaLabel: "Arrange a viewing",
          ctaHref: "#contact",
        },
      },
      {
        type: "About",
        props: {
          id: "About-1",
          heading: "The practice",
          body: "We keep our portfolio deliberately small so every client receives undivided attention. From the first private viewing to closing day, you work directly with the people making the decisions — no handoffs, no noise.\n\nOur reputation rests on a simple record: properties sold at the right price, and sold in the right time.",
        },
      },
      {
        type: "ListingGrid",
        props: {
          id: "ListingGrid-1",
          heading: "Current portfolio",
          count: 6,
        },
      },
      {
        type: "Contact",
        props: {
          id: "Contact-1",
          heading: "Begin the conversation",
          email: "hello@meridian-estate.com",
          phone: "(555) 123-4567",
        },
      },
    ],
    zones: {},
  },
}

export const estate: TemplateModule = {
  meta: {
    id: "estate",
    name: "Estate",
    description: "Dark, discreet, and gold-trimmed — a luxury brokerage presence.",
    thumbnail: svgThumbnail(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'><rect width='320' height='160' fill='#23201c'/><rect x='140' y='34' width='40' height='2' fill='#c9a35c'/><rect x='90' y='58' width='140' height='12' fill='#e9e2d2'/><rect x='110' y='80' width='100' height='6' fill='#8f8878'/><rect x='120' y='112' width='80' height='20' fill='none' stroke='#c9a35c' stroke-width='1.5'/></svg>",
    ),
  },
  schemaVersion: 1,
  Root: EstateRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () =>
    composeConfig({ root: buildRootConfig(EstateRoot), renderOverrides: estateBlocks }),
}
