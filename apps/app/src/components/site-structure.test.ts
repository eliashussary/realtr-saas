import type { Data } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { parseSiteDocument } from "@realtr/site/document"
import { describe, expect, it } from "vitest"
import {
  type StructureInput,
  cleanStructure,
  structureFromDocument,
  suggestSlug,
} from "./site-structure"

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const homeId = uuid(1)
const aboutId = uuid(2)
const puck: Data = { content: [], root: { props: {} } }

function messyStructure(): StructureInput {
  return {
    pages: [
      {
        id: homeId,
        slug: "",
        title: "  Home  ",
        status: "active",
        seo: { title: "  Welcome ", description: "", noIndex: false },
      },
      {
        id: aboutId,
        slug: "  About Us  ",
        title: "About",
        status: "hidden",
        seo: { title: "", description: "  Our team ", noIndex: true },
      },
    ],
    navigation: [
      { id: uuid(3), label: " Home ", kind: "page", pageId: homeId, href: "" },
      { id: uuid(4), label: "Ghost", kind: "page", pageId: uuid(9), href: "" }, // missing page
      { id: uuid(5), label: "", kind: "url", pageId: "", href: "https://x.com" }, // empty label
      { id: uuid(6), label: "Blog", kind: "url", pageId: "", href: "not a url" }, // bad url
      { id: uuid(7), label: "Instagram", kind: "url", pageId: "", href: "https://ig.com/a" },
    ],
    redirects: [
      { id: uuid(8), fromSlug: "/old-home ", toSlug: "/", permanent: true },
      { id: uuid(9), fromSlug: "about-us", toSlug: "about-us", permanent: false }, // self
      { id: uuid(3), fromSlug: "about-us", toSlug: "/", permanent: false }, // collides with page
      { id: uuid(4), fromSlug: "", toSlug: "/", permanent: false }, // empty
    ],
  }
}

describe("cleanStructure", () => {
  it("normalizes pages, locks the home slug, and prunes seo", () => {
    const clean = cleanStructure(messyStructure(), [
      { id: homeId, puck },
      { id: aboutId, puck },
    ])

    expect(clean.pages.map((page) => ({ slug: page.slug, title: page.title }))).toEqual([
      { slug: "", title: "Home" },
      { slug: "about-us", title: "About" },
    ])
    expect(clean.pages[0]?.seo).toEqual({ title: "Welcome" })
    expect(clean.pages[1]?.seo).toEqual({ description: "Our team", noIndex: true })
    expect(clean.pages[1]?.status).toBe("hidden")
  })

  it("keeps only resolvable navigation items and flattens children", () => {
    const clean = cleanStructure(messyStructure(), [
      { id: homeId, puck },
      { id: aboutId, puck },
    ])

    expect(clean.navigation).toEqual([
      { id: uuid(3), label: "Home", pageId: homeId, children: [] },
      { id: uuid(7), label: "Instagram", href: "https://ig.com/a", children: [] },
    ])
  })

  it("drops empty, self, colliding, and duplicate redirects", () => {
    const clean = cleanStructure(messyStructure(), [
      { id: homeId, puck },
      { id: aboutId, puck },
    ])

    expect(clean.redirects).toEqual([
      { id: uuid(8), fromSlug: "old-home", toSlug: "", permanent: true },
    ])
  })

  it("carries page content over by id and starts new pages empty", () => {
    const withContent: Data = { content: [], root: { props: { title: "kept" } } }
    const clean = cleanStructure(messyStructure(), [{ id: homeId, puck: withContent }])

    expect(clean.pages[0]?.puck).toBe(withContent)
    expect(clean.pages[1]?.puck).toEqual({ content: [], root: { props: {} } })
  })

  it("produces a document the strict schema accepts", () => {
    const clean = cleanStructure(messyStructure(), [
      { id: homeId, puck },
      { id: aboutId, puck },
    ])
    const modern = getTemplate("modern")

    const parsed = parseSiteDocument({
      schemaVersion: 1,
      template: { id: "modern", schemaVersion: modern.schemaVersion },
      settings: { siteTitle: "Site", contact: {}, socialLinks: [] },
      theme: {},
      navigation: clean.navigation,
      pages: clean.pages,
      redirects: clean.redirects,
    })

    expect(parsed.pages).toHaveLength(2)
    expect(parsed.redirects).toHaveLength(1)
  })
})

describe("structureFromDocument / suggestSlug", () => {
  it("round-trips through structureFromDocument without losing data", () => {
    const clean = cleanStructure(messyStructure(), [
      { id: homeId, puck },
      { id: aboutId, puck },
    ])
    const reloaded = cleanStructure(structureFromDocument({ ...clean }), clean.pages)
    expect(reloaded.pages.map((p) => p.slug)).toEqual(["", "about-us"])
    expect(reloaded.navigation).toEqual(clean.navigation)
    expect(reloaded.redirects).toEqual(clean.redirects)
  })

  it("suggests a slug from a title", () => {
    expect(suggestSlug("Our Listings!")).toBe("our-listings")
    expect(suggestSlug("   ")).toBe("")
  })
})
