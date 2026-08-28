import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { type SiteDocumentV1, convertLegacySiteDocument, resolvePageBySlug } from "./site-document"

function documentFixture(): SiteDocumentV1 {
  const base = convertLegacySiteDocument({ templateId: "modern" }, { generateId: randomUUID })
  return {
    ...base,
    pages: [
      { ...base.pages[0]!, slug: "" },
      {
        id: randomUUID(),
        slug: "about",
        title: "About",
        status: "active",
        seo: {},
        puck: { content: [] },
      },
      {
        id: randomUUID(),
        slug: "secret",
        title: "Secret",
        status: "hidden",
        seo: {},
        puck: { content: [] },
      },
    ],
    redirects: [{ id: randomUUID(), fromSlug: "old", toSlug: "about", permanent: true }],
  }
}

describe("resolvePageBySlug", () => {
  const document = documentFixture()

  it("resolves the home page for the empty slug", () => {
    expect(resolvePageBySlug(document, "")).toMatchObject({ kind: "page", page: { slug: "" } })
  })

  it("resolves an active page and normalizes the incoming path", () => {
    expect(resolvePageBySlug(document, "/About/")).toMatchObject({
      kind: "page",
      page: { slug: "about" },
    })
  })

  it("does not serve a hidden page", () => {
    expect(resolvePageBySlug(document, "secret")).toEqual({ kind: "not_found" })
  })

  it("follows a redirect over a 404", () => {
    expect(resolvePageBySlug(document, "old")).toEqual({
      kind: "redirect",
      toSlug: "about",
      permanent: true,
    })
  })

  it("returns not_found for unknown and un-normalizable slugs", () => {
    expect(resolvePageBySlug(document, "missing")).toEqual({ kind: "not_found" })
    expect(resolvePageBySlug(document, "%zz")).toEqual({ kind: "not_found" })
  })
})
