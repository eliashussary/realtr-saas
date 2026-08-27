import { describe, expect, it } from "vitest"
import {
  SiteDocumentSchema,
  convertLegacySiteDocument,
  migrateSiteDocument,
  normalizePageSlug,
  parseSiteDocument,
} from "./site-document"
import { modern } from "./templates/modern"

const uuids = Array.from(
  { length: 20 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
)

function idFactory() {
  let index = 0
  return () => uuids[index++] ?? uuids.at(-1)!
}

function validDocument() {
  return convertLegacySiteDocument(
    {
      templateId: "modern",
      theme: modern.defaultTheme,
      pages: modern.defaultPages,
      siteTitle: "Demo Realty",
    },
    { generateId: idFactory() },
  )
}

describe("site document contract", () => {
  it("converts legacy template data into a valid, stable V1 envelope", () => {
    const document = validDocument()

    expect(document.schemaVersion).toBe(1)
    expect(document.template).toEqual({ id: "modern", schemaVersion: 1 })
    expect(document.pages).toHaveLength(1)
    expect(document.pages[0]?.slug).toBe("")
    expect(document.navigation[0]?.pageId).toBe(document.pages[0]?.id)
    expect(SiteDocumentSchema.parse(document)).toEqual(document)
  })

  it("canonicalizes route paths before validating uniqueness", () => {
    const document = validDocument()
    document.pages[0]!.slug = "/NÉIGHBOURHOODS/"

    expect(parseSiteDocument(document).pages[0]?.slug).toBe("néighbourhoods")
    expect(normalizePageSlug(" /Homes/For-Sale/ ")).toBe("homes/for-sale")
    expect(() => normalizePageSlug("/api/private")).toThrow("reserved")
    expect(() => normalizePageSlug("/%ZZ")).toThrow("percent encoding")
  })

  it("rejects unknown blocks and duplicate stable IDs", () => {
    const unknownBlock = structuredClone(validDocument())
    unknownBlock.pages[0]!.puck.content[0]!.type = "CustomScript" as "Hero"
    expect(() => parseSiteDocument(unknownBlock)).toThrow()

    const duplicateBlock = structuredClone(validDocument())
    duplicateBlock.pages[0]!.puck.content[1]!.props.id =
      duplicateBlock.pages[0]!.puck.content[0]!.props.id
    expect(() => parseSiteDocument(duplicateBlock)).toThrow("Duplicate block ID")
  })

  it("rejects unsafe URLs, CSS injection, and dangling page references", () => {
    const unsafeUrl = structuredClone(validDocument())
    const hero = unsafeUrl.pages[0]!.puck.content[0]
    if (hero?.type === "Hero") hero.props.ctaHref = "javascript:alert(1)"
    expect(() => parseSiteDocument(unsafeUrl)).toThrow("safe relative")

    const unsafeTheme = structuredClone(validDocument())
    unsafeTheme.theme.colors = { brand: "red; background:url(https://example.com)" }
    expect(() => parseSiteDocument(unsafeTheme)).toThrow("Unsafe CSS value")

    const danglingNavigation = structuredClone(validDocument())
    danglingNavigation.navigation[0]!.pageId = uuids[19]!
    expect(() => parseSiteDocument(danglingNavigation)).toThrow("Unknown page ID")
  })

  it("bounds recursive navigation and arbitrary root data", () => {
    const deepNavigation = structuredClone(validDocument())
    let item = deepNavigation.navigation[0]!
    for (let index = 0; index < 6; index++) {
      const child = { ...item, id: uuids[index + 10]!, children: [] }
      item.children = [child]
      item = child
    }
    expect(() => parseSiteDocument(deepNavigation)).toThrow("nesting is too deep")

    const deepRoot = structuredClone(validDocument())
    type NestedJson = { [key: string]: string | NestedJson }
    let nested: NestedJson = {}
    deepRoot.pages[0]!.puck.root = { props: nested }
    for (let index = 0; index < 11; index++) {
      nested.child = {}
      nested = nested.child as NestedJson
    }
    expect(() => parseSiteDocument(deepRoot)).toThrow()
  })

  it("enforces canonical redirects and document size limits", () => {
    const document = validDocument()
    document.redirects.push({
      id: uuids[10]!,
      fromSlug: "/OLD-HOME/",
      toSlug: "/",
      permanent: true,
    })
    expect(parseSiteDocument(document).redirects[0]).toMatchObject({
      fromSlug: "old-home",
      toSlug: "",
    })
    expect(() => parseSiteDocument(document, { maxBytes: 10 })).toThrow("byte limit")
  })

  it("requires explicit stepwise migrations and rejects future versions", () => {
    const current = validDocument()
    const legacyVersion = { ...current, schemaVersion: 0 }
    expect(() => migrateSiteDocument(legacyVersion)).toThrow("No site document migration")
    expect(
      migrateSiteDocument(legacyVersion, [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (document) => ({ ...(document as object), schemaVersion: 1 }),
        },
      ]),
    ).toEqual(current)
    expect(() => migrateSiteDocument({ ...current, schemaVersion: 2 })).toThrow("future")
  })

  it("requires explicit template and block compatibility migrations", () => {
    const current = validDocument()
    const oldTemplate = {
      ...current,
      template: { ...current.template, schemaVersion: 0 },
    }

    expect(() => migrateSiteDocument(oldTemplate)).toThrow("compatibility migration")
    expect(
      migrateSiteDocument(
        oldTemplate,
        [],
        [
          {
            templateId: "modern",
            fromVersion: 0,
            toVersion: 1,
            migrate: (document) => ({
              ...(document as typeof oldTemplate),
              template: { id: "modern", schemaVersion: 1 },
            }),
          },
        ],
      ),
    ).toEqual(current)
  })
})
