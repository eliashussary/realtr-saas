import { getTemplate } from "@realtr/site"
import { parseSiteDocument } from "@realtr/site/document"
import { describe, expect, it } from "vitest"
import { type BrandingInput, brandingFromDocument, cleanBrandingInput } from "./site-settings"

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

function messyInput(): BrandingInput {
  return {
    settings: {
      siteTitle: "  Bayview Realty  ",
      logoAssetId: uuid(9),
      contact: { email: "  agent@example.com ", phone: "   " },
      socialLinks: [
        { id: uuid(1), service: " Instagram ", url: " https://instagram.com/agent " },
        { id: uuid(2), service: "Twitter", url: "not-a-url" }, // invalid url -> dropped
        { id: uuid(3), service: "", url: "" }, // empty row -> dropped
      ],
    },
    theme: {
      colors: { brand: " oklch(0.55 0.2 255) ", accent: "", background: "  " },
      fonts: { heading: "", body: " Inter, sans-serif " },
      radius: "  0.5rem ",
    },
  }
}

describe("cleanBrandingInput", () => {
  it("prunes empty values and keeps non-hex colors", () => {
    const clean = cleanBrandingInput(messyInput())

    expect(clean.theme.colors).toEqual({ brand: "oklch(0.55 0.2 255)" })
    expect(clean.theme.fonts).toEqual({ body: "Inter, sans-serif" })
    expect(clean.theme.radius).toBe("0.5rem")
  })

  it("keeps only complete, valid social links and trims contact", () => {
    const clean = cleanBrandingInput(messyInput())

    expect(clean.settings.socialLinks).toEqual([
      { id: uuid(1), service: "Instagram", url: "https://instagram.com/agent" },
    ])
    expect(clean.settings.contact).toEqual({ email: "agent@example.com" })
    expect(clean.settings.siteTitle).toBe("Bayview Realty")
    expect(clean.settings.logoAssetId).toBe(uuid(9))
  })

  it("produces a shape the strict site-document schema accepts", () => {
    const clean = cleanBrandingInput(messyInput())
    const modern = getTemplate("modern")

    const parsed = parseSiteDocument({
      schemaVersion: 1,
      template: { id: "modern", schemaVersion: modern.schemaVersion },
      settings: clean.settings,
      theme: clean.theme,
      navigation: [],
      pages: [
        {
          id: uuid(1),
          slug: "",
          title: "Home",
          status: "active",
          seo: {},
          puck: { content: [], root: { props: {} } },
        },
      ],
      redirects: [],
    })

    expect(parsed.settings.siteTitle).toBe("Bayview Realty")
    expect(parsed.theme.colors?.brand).toBe("oklch(0.55 0.2 255)")
  })

  it("round-trips through brandingFromDocument without losing data", () => {
    const clean = cleanBrandingInput(messyInput())
    const reloaded = cleanBrandingInput(
      brandingFromDocument({ settings: clean.settings, theme: clean.theme }),
    )
    expect(reloaded).toEqual(clean)
  })
})
