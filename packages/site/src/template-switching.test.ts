import { describe, expect, it } from "vitest"
import { getTemplate, templateList, templateRegistry } from "./registry"
import { convertLegacySiteDocument, parseSiteDocument } from "./site-document"
import { classic } from "./templates/classic"
import { modern } from "./templates/modern"

const uuids = Array.from(
  { length: 20 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
)

function idFactory() {
  let index = 0
  return () => uuids[index++] ?? uuids.at(-1)!
}

function documentFor(templateId: string) {
  const template = getTemplate(templateId)
  return convertLegacySiteDocument(
    {
      templateId,
      theme: template.defaultTheme,
      pages: template.defaultPages,
      siteTitle: "Demo Realty",
    },
    { generateId: idFactory() },
  )
}

describe("template switching", () => {
  it("registers more than one selectable template", () => {
    expect(templateList.length).toBeGreaterThan(1)
    expect(templateList.map((template) => template.id)).toEqual(
      expect.arrayContaining(["modern", "classic"]),
    )
  })

  it("shares one block set, so page content is compatible across templates", () => {
    const componentKeys = (id: string) =>
      Object.keys(templateRegistry[id]?.buildConfig().components ?? {}).sort()

    expect(componentKeys("classic")).toEqual(componentKeys("modern"))
  })

  it("keeps a document valid when its template is switched in place", () => {
    const document = documentFor("modern")

    const switched = parseSiteDocument({
      ...document,
      template: { id: "classic", schemaVersion: classic.schemaVersion },
    })

    // Content and pages carry over untouched; only the template reference changes.
    expect(switched.template).toEqual({ id: "classic", schemaVersion: classic.schemaVersion })
    expect(switched.pages).toEqual(document.pages)
  })

  it("seeds each template with a valid default document", () => {
    for (const meta of templateList) {
      expect(() => documentFor(meta.id)).not.toThrow()
    }
    expect(modern.schemaVersion).toBeGreaterThan(0)
    expect(classic.schemaVersion).toBeGreaterThan(0)
  })
})
