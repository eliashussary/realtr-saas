import type { ThemeTokens } from "@realtr/ui/tokens"
import { composeConfig } from "../../blocks"
import type { Pages, TemplateModule } from "../../types"
import { buildRootConfig } from "../shared"
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
  },
  schemaVersion: 1,
  Root: ClassicRoot,
  defaultTheme,
  defaultPages,
  buildConfig: () => composeConfig({ root: buildRootConfig(ClassicRoot) }),
}
