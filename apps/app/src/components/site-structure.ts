import type { Data } from "@measured/puck"
import { normalizePageSlug } from "@realtr/site/document"

// Editing shapes for the pages / navigation / redirects panel. These mirror the `pages`,
// `navigation`, and `redirects` branches of the site document (see @realtr/site/document) but keep
// every value as a plain, always-present field so controlled inputs never crash on a half-typed
// value. `cleanStructure` turns them back into the pruned, schema-valid shape the draft API
// persists, reusing existing page content by id.

export type PageStatus = "active" | "hidden"

export interface PageMetaInput {
  id: string
  slug: string
  title: string
  status: PageStatus
  seo: { title: string; description: string; noIndex: boolean }
}

export type NavKind = "page" | "url"

export interface NavItemInput {
  id: string
  label: string
  kind: NavKind
  pageId: string
  href: string
}

export interface RedirectInput {
  id: string
  fromSlug: string
  toSlug: string
  permanent: boolean
}

export interface StructureInput {
  pages: PageMetaInput[]
  navigation: NavItemInput[]
  redirects: RedirectInput[]
}

const EMPTY_PUCK: Data = { content: [], root: { props: {} } }

/** The home page is the one served at "/" — its slug is always the empty string. */
export function isHomePage(page: { slug: string }): boolean {
  return page.slug === ""
}

/**
 * Turn free text into a slug candidate: lowercase, replace non-alphanumeric runs with hyphens, and
 * preserve "/" as a path separator. The result is validated by `normalizePageSlug` so reserved
 * segments are still rejected.
 */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .split("/")
    .map((segment) => segment.replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/")
}

/** Slugify and validate free text into a usable, non-home slug, or "" when nothing usable remains. */
export function toSlug(input: string): string {
  const candidate = slugify(input)
  if (candidate === "") return ""
  try {
    return normalizePageSlug(candidate)
  } catch {
    return ""
  }
}

/**
 * Slugify a redirect *target*, where the home page ("/") is a valid destination that resolves to the
 * empty string. Returns null when the field is blank (not yet entered) or malformed.
 */
function toTarget(input: string): string | null {
  if (input.trim() === "") return null
  const candidate = slugify(input)
  try {
    return normalizePageSlug(candidate)
  } catch {
    return null
  }
}

/** A URL acceptable for a navigation item: relative, fragment, or http(s)/mailto/tel. */
export function isSafeNavUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === "") return false
  if (trimmed.startsWith("#")) return trimmed.length > 1
  if (trimmed.startsWith("/")) return !trimmed.startsWith("//")
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(trimmed)
}

export function structureFromDocument(document: {
  pages?: Array<{
    id: string
    slug: string
    title: string
    status?: PageStatus
    seo?: { title?: string; description?: string; noIndex?: boolean }
  }>
  navigation?: Array<{ id: string; label: string; pageId?: string; href?: string }>
  redirects?: Array<{ id: string; fromSlug: string; toSlug: string; permanent: boolean }>
}): StructureInput {
  return {
    pages: (document.pages ?? []).map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      status: page.status ?? "active",
      seo: {
        title: page.seo?.title ?? "",
        description: page.seo?.description ?? "",
        noIndex: page.seo?.noIndex ?? false,
      },
    })),
    navigation: (document.navigation ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      kind: item.pageId ? "page" : "url",
      pageId: item.pageId ?? "",
      href: item.href ?? "",
    })),
    redirects: (document.redirects ?? []).map((redirect) => ({
      id: redirect.id,
      fromSlug: redirect.fromSlug,
      // A stored empty target means "redirect to the home page"; show it as "/" so the field is not
      // mistaken for an unfinished row.
      toSlug: redirect.toSlug === "" ? "/" : redirect.toSlug,
      permanent: redirect.permanent,
    })),
  }
}

export interface CleanPage {
  id: string
  slug: string
  title: string
  status: PageStatus
  seo: { title?: string; description?: string; noIndex?: boolean }
  puck: Data
}

export interface CleanStructure {
  pages: CleanPage[]
  navigation: Array<{ id: string; label: string; pageId?: string; href?: string; children: [] }>
  redirects: Array<{ id: string; fromSlug: string; toSlug: string; permanent: boolean }>
}

/**
 * Convert editing input into the pruned shape the draft API persists. Page content is carried over
 * from `existingPages` by id (new pages start empty). Empty and invalid entries are dropped so the
 * strict document schema accepts the result and autosave is never blocked by a half-typed row:
 * navigation items that reference a removed page or lack a target, and redirects that are empty,
 * self-referential, duplicated, or collide with a page slug, are all left out of the saved document
 * while remaining visible in the panel.
 */
export function cleanStructure(
  input: StructureInput,
  existingPages: ReadonlyArray<{ id: string; puck: Data }>,
): CleanStructure {
  const puckById = new Map(existingPages.map((page) => [page.id, page.puck]))

  const pages: CleanPage[] = input.pages.map((page) => {
    const home = isHomePage({ slug: page.slug })
    const slug = home ? "" : toSlug(page.slug) || toSlug(page.title) || page.id.slice(0, 8)
    const title = page.title.trim() || page.slug.trim() || "Untitled"
    const seo: CleanPage["seo"] = {}
    const seoTitle = page.seo.title.trim()
    const seoDescription = page.seo.description.trim()
    if (seoTitle) seo.title = seoTitle
    if (seoDescription) seo.description = seoDescription
    if (page.seo.noIndex) seo.noIndex = true
    return {
      id: page.id,
      slug,
      title,
      status: page.status,
      seo,
      puck: puckById.get(page.id) ?? EMPTY_PUCK,
    }
  })

  const pageIds = new Set(pages.map((page) => page.id))
  const pageSlugs = new Set(pages.map((page) => page.slug))

  const navigation: CleanStructure["navigation"] = []
  for (const item of input.navigation) {
    const label = item.label.trim()
    if (label === "") continue
    if (item.kind === "page") {
      if (!item.pageId || !pageIds.has(item.pageId)) continue
      navigation.push({ id: item.id, label, pageId: item.pageId, children: [] })
    } else {
      if (!isSafeNavUrl(item.href)) continue
      navigation.push({ id: item.id, label, href: item.href.trim(), children: [] })
    }
  }

  const redirects: CleanStructure["redirects"] = []
  const seenFrom = new Set<string>()
  for (const redirect of input.redirects) {
    const from = toSlug(redirect.fromSlug)
    const to = toTarget(redirect.toSlug)
    if (from === "" || to === null) continue
    if (from === to) continue
    if (pageSlugs.has(from)) continue
    if (seenFrom.has(from)) continue
    seenFrom.add(from)
    redirects.push({ id: redirect.id, fromSlug: from, toSlug: to, permanent: redirect.permanent })
  }

  return { pages, navigation, redirects }
}

/** Build an empty page with a fresh id, for "Add page" in the panel. */
export function makeNewPage(id: string, title: string, slug: string): PageMetaInput {
  return {
    id,
    slug,
    title,
    status: "active",
    seo: { title: "", description: "", noIndex: false },
  }
}

/** Suggest a slug from a page title (best-effort; empty when nothing usable). */
export function suggestSlug(title: string): string {
  return toSlug(title)
}
