import { describe, expect, it } from "vitest"
import { type SiteDocumentV1, resolveNavigation } from "./site-document"

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

// resolveNavigation only reads `pages` and `navigation`, so a partial cast keeps the fixture small.
function documentWith(
  pages: Array<{ id: string; slug: string; status: "active" | "hidden" }>,
  navigation: Array<{ id: string; label: string; pageId?: string; href?: string }>,
): SiteDocumentV1 {
  return { pages, navigation } as unknown as SiteDocumentV1
}

describe("resolveNavigation", () => {
  it("resolves page references to paths and passes URLs through", () => {
    const resolved = resolveNavigation(
      documentWith(
        [
          { id: uuid(1), slug: "", status: "active" },
          { id: uuid(2), slug: "about", status: "active" },
        ],
        [
          { id: uuid(3), label: "Home", pageId: uuid(1) },
          { id: uuid(4), label: "About", pageId: uuid(2) },
          { id: uuid(5), label: "Blog", href: "https://blog.example.com" },
        ],
      ),
    )

    expect(resolved).toEqual([
      { id: uuid(3), label: "Home", href: "/" },
      { id: uuid(4), label: "About", href: "/about" },
      { id: uuid(5), label: "Blog", href: "https://blog.example.com" },
    ])
  })

  it("drops items pointing at missing or hidden pages", () => {
    const resolved = resolveNavigation(
      documentWith(
        [
          { id: uuid(1), slug: "", status: "active" },
          { id: uuid(2), slug: "secret", status: "hidden" },
        ],
        [
          { id: uuid(3), label: "Home", pageId: uuid(1) },
          { id: uuid(4), label: "Secret", pageId: uuid(2) }, // hidden -> dropped
          { id: uuid(5), label: "Gone", pageId: uuid(9) }, // missing -> dropped
        ],
      ),
    )

    expect(resolved).toEqual([{ id: uuid(3), label: "Home", href: "/" }])
  })
})
