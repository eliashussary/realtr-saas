import type { SiteDocumentV1 } from "@realtr/site/document"
import { describe, expect, it } from "vitest"
import { buildPageSeo, resolveOrigin, robotsTxt, serializeJsonLd, sitemapXml } from "./seo"

function doc(overrides: Partial<SiteDocumentV1> = {}): SiteDocumentV1 {
  return {
    settings: {
      siteTitle: "Bayview Realty",
      contact: { email: "agent@example.com", phone: "(555) 123-4567" },
      socialLinks: [{ id: "s1", service: "Instagram", url: "https://instagram.com/agent" }],
    },
    pages: [
      { id: "p1", slug: "", title: "Home", status: "active", seo: {}, puck: { content: [] } },
      {
        id: "p2",
        slug: "about",
        title: "About",
        status: "active",
        seo: { title: "About us", description: "Our team" },
        puck: { content: [] },
      },
      {
        id: "p3",
        slug: "secret",
        title: "Secret",
        status: "active",
        seo: { noIndex: true },
        puck: { content: [] },
      },
      { id: "p4", slug: "draft", title: "Draft", status: "hidden", seo: {}, puck: { content: [] } },
    ],
    ...overrides,
  } as unknown as SiteDocumentV1
}

const find = (meta: Array<Record<string, string>>, key: "name" | "property", value: string) =>
  meta.find((entry) => entry[key] === value)?.content

describe("resolveOrigin", () => {
  it("uses the forwarded protocol when present, else https, http for localhost", () => {
    expect(resolveOrigin("realtr.app", "https")).toBe("https://realtr.app")
    expect(resolveOrigin("realtr.app", "http, https")).toBe("http://realtr.app")
    expect(resolveOrigin("agent.realtr.app")).toBe("https://agent.realtr.app")
    expect(resolveOrigin("localhost:3000")).toBe("http://localhost:3000")
  })
})

describe("buildPageSeo", () => {
  it("emits canonical, Open Graph, and Twitter tags for a page", () => {
    const document = doc()
    const about = document.pages[1]!
    const seo = buildPageSeo(document, about, "https://bayview.realtr.app")

    expect(seo.links).toContainEqual({ rel: "canonical", href: "https://bayview.realtr.app/about" })
    expect(seo.meta[0]).toEqual({ title: "About us" })
    expect(find(seo.meta, "name", "description")).toBe("Our team")
    expect(find(seo.meta, "property", "og:url")).toBe("https://bayview.realtr.app/about")
    expect(find(seo.meta, "property", "og:site_name")).toBe("Bayview Realty")
    expect(find(seo.meta, "name", "twitter:card")).toBe("summary")
  })

  it("marks noindex pages and canonicalizes the home page to /", () => {
    const document = doc()
    const home = buildPageSeo(document, document.pages[0]!, "https://x.app")
    expect(home.links).toContainEqual({ rel: "canonical", href: "https://x.app/" })
    expect(find(home.meta, "name", "robots")).toBeUndefined()

    const secret = buildPageSeo(document, document.pages[2]!, "https://x.app")
    expect(find(secret.meta, "name", "robots")).toBe("noindex, nofollow")
  })

  it("adds RealEstateAgent JSON-LD only on the home page", () => {
    const document = doc()
    const home = buildPageSeo(document, document.pages[0]!, "https://x.app")
    const types = home.jsonLd.map((entry) => entry["@type"])
    expect(types).toEqual(["WebSite", "RealEstateAgent"])
    const agent = home.jsonLd.find((entry) => entry["@type"] === "RealEstateAgent")
    expect(agent).toMatchObject({
      name: "Bayview Realty",
      email: "agent@example.com",
      telephone: "(555) 123-4567",
      sameAs: ["https://instagram.com/agent"],
    })

    const about = buildPageSeo(document, document.pages[1]!, "https://x.app")
    expect(about.jsonLd.map((entry) => entry["@type"])).toEqual(["WebSite"])
  })
})

describe("serializeJsonLd", () => {
  it("escapes < so a value cannot break out of the script tag", () => {
    expect(serializeJsonLd({ name: "</script><x>" })).not.toContain("</script>")
    expect(serializeJsonLd({ name: "a<b" })).toContain("\\u003c")
  })
})

describe("sitemapXml / robotsTxt", () => {
  it("lists only active, indexable pages as absolute URLs", () => {
    const xml = sitemapXml(doc(), "https://bayview.realtr.app")
    expect(xml).toContain("<loc>https://bayview.realtr.app/</loc>")
    expect(xml).toContain("<loc>https://bayview.realtr.app/about</loc>")
    expect(xml).not.toContain("/secret") // noindex
    expect(xml).not.toContain("/draft") // hidden
  })

  it("points robots.txt at the sitemap", () => {
    expect(robotsTxt("https://x.app")).toContain("Sitemap: https://x.app/sitemap.xml")
  })
})
