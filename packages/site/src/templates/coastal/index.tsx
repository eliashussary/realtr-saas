import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig, svgThumbnail } from "../shared"
import { coastalBlocks } from "./blocks"
import { CoastalRoot } from "./root"

const defaultTheme: ThemeTokens = {
  colors: {
    brand: "oklch(0.45 0.09 225)",
    accent: "oklch(0.78 0.08 190)",
    background: "oklch(0.985 0.006 90)",
    foreground: "oklch(0.30 0.03 240)",
    muted: "oklch(0.52 0.02 240)",
  },
  fonts: {
    heading: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    body: '"Avenir Next", "Avenir", "Segoe UI", system-ui, sans-serif',
  },
  radius: "1.25rem",
}

const defaultPages: Pages = {
  "/": {
    root: { props: { title: "Harbour & Pine" } },
    content: [
      {
        type: "Hero",
        props: {
          id: "Hero-1",
          title: "Life by the water, found by you.",
          subtitle:
            "Neighbourhood knowledge, unhurried advice, and a shortlist of homes that feel like they were always yours. We keep the process calm from first viewing to closing day.",
          ctaLabel: "Browse the listings",
          ctaHref: "#listings",
        },
      },
      {
        type: "About",
        props: {
          id: "About-1",
          heading: "People who know every corner",
          body: "We grew up on these streets and we still walk them every week. That's how we know which light is worth paying for, which backs are quiet, and which corner lot will outlive the next market turn.\n\nSelling? We'll tell you the truth about your home — the good and the otherwise — so you can price it with confidence.",
        },
      },
      {
        type: "ListingGrid",
        props: { id: "ListingGrid-1", heading: "Homes we love right now", count: 6 },
      },
      {
        type: "Contact",
        props: {
          id: "Contact-1",
          heading: "Say hello",
          email: "hello@harbourandpine.ca",
          phone: "(555) 123-4567",
        },
      },
    ],
    zones: {},
  },
}

export const coastal: TemplateModule = {
  meta: {
    id: "coastal",
    name: "Coastal",
    description: "Bright, rounded, and easy — a waterfront-boutique feel.",
    thumbnail: svgThumbnail(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 160'><rect width='320' height='160' fill='#faf8f4'/><rect x='16' y='12' width='288' height='26' rx='13' fill='#ffffff'/><circle cx='34' cy='25' r='6' fill='#1f5f74'/><rect x='200' y='21' width='24' height='8' rx='4' fill='#7fb6bf'/><rect x='232' y='21' width='24' height='8' rx='4' fill='#7fb6bf'/><rect x='70' y='70' width='180' height='12' rx='6' fill='#274b57'/><rect x='95' y='92' width='130' height='7' rx='3.5' fill='#8aa6ad'/><rect x='125' y='118' width='70' height='22' rx='11' fill='#1f5f74'/></svg>",
    ),
  },
  schemaVersion: 1,
  Root: CoastalRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () =>
    composeConfig({ root: buildRootConfig(CoastalRoot), renderOverrides: coastalBlocks }),
}
