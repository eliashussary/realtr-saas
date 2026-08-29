import { Button } from "@realtr/ui/components/button"
import { Field, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  type NavItemInput,
  type PageMetaInput,
  type RedirectInput,
  type StructureInput,
  isHomePage,
  makeNewPage,
  toSlug,
} from "./site-structure"

// Pages / navigation / redirects editor, rendered as a left-rail tab inside the site editor (M2 —
// moved out of a modal dialog so the site's page map lives beside the canvas, like Puck's component
// list). Fully controlled: edits flow up through onChange; the editor autosaves and refreshes the
// canvas when the Pages tab is left.

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const item = next[index]
  if (item === undefined) return items
  next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = toSlug(base) || "page"
  if (!taken.has(root)) return root
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export function PagesNavPanel({
  value,
  onChange,
  currentPageId,
  onEditPage,
}: {
  value: StructureInput
  onChange: (next: StructureInput) => void
  currentPageId: string
  onEditPage: (id: string) => void
}) {
  const setPages = (pages: PageMetaInput[]) => onChange({ ...value, pages })
  const setNavigation = (navigation: NavItemInput[]) => onChange({ ...value, navigation })
  const setRedirects = (redirects: RedirectInput[]) => onChange({ ...value, redirects })

  const updatePage = (id: string, patch: Partial<PageMetaInput>) =>
    setPages(value.pages.map((page) => (page.id === id ? { ...page, ...patch } : page)))

  const updatePageSeo = (id: string, patch: Partial<PageMetaInput["seo"]>) =>
    setPages(
      value.pages.map((page) =>
        page.id === id ? { ...page, seo: { ...page.seo, ...patch } } : page,
      ),
    )

  const addPage = () => {
    const taken = new Set(value.pages.map((page) => toSlug(page.slug)).filter(Boolean))
    const slug = uniqueSlug("new-page", taken)
    setPages([...value.pages, makeNewPage(crypto.randomUUID(), "New page", slug)])
  }

  const deletePage = (id: string) => setPages(value.pages.filter((page) => page.id !== id))

  const addNavItem = () =>
    setNavigation([
      ...value.navigation,
      {
        id: crypto.randomUUID(),
        label: "",
        kind: "page",
        pageId: value.pages[0]?.id ?? "",
        href: "",
      },
    ])

  const updateNavItem = (id: string, patch: Partial<NavItemInput>) =>
    setNavigation(value.navigation.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const addRedirect = () =>
    setRedirects([
      ...value.redirects,
      { id: crypto.randomUUID(), fromSlug: "", toSlug: "", permanent: true },
    ])

  const updateRedirect = (id: string, patch: Partial<RedirectInput>) =>
    setRedirects(value.redirects.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const canDeletePage = (page: PageMetaInput) => !isHomePage(page) && value.pages.length > 1

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <SectionHeading>Pages</SectionHeading>
        {value.pages.map((page) => {
          const home = isHomePage(page)
          const path = home ? "/" : `/${toSlug(page.slug) || "…"}`
          const active = page.id === currentPageId
          return (
            <div
              key={page.id}
              className={`flex flex-col gap-3 rounded-lg border p-3 ${
                active ? "border-primary bg-primary/5" : "border-border bg-muted/30"
              }`}
            >
              <Field>
                <FieldLabel htmlFor={`page-title-${page.id}`}>Title</FieldLabel>
                <Input
                  id={`page-title-${page.id}`}
                  value={page.title}
                  onChange={(event) => updatePage(page.id, { title: event.target.value })}
                  aria-invalid={page.title.trim() === "" || undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`page-slug-${page.id}`}>Path</FieldLabel>
                <Input
                  id={`page-slug-${page.id}`}
                  value={home ? "/" : page.slug}
                  disabled={home}
                  onChange={(event) => updatePage(page.id, { slug: event.target.value })}
                  placeholder="about-us"
                  className="font-mono"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`page-status-${page.id}`}>Status</FieldLabel>
                <select
                  id={`page-status-${page.id}`}
                  className={selectClass}
                  value={page.status}
                  onChange={(event) =>
                    updatePage(page.id, { status: event.target.value as PageMetaInput["status"] })
                  }
                >
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                </select>
              </Field>

              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  SEO &amp; metadata
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor={`seo-title-${page.id}`}>SEO title</FieldLabel>
                    <Input
                      id={`seo-title-${page.id}`}
                      value={page.seo.title}
                      onChange={(event) => updatePageSeo(page.id, { title: event.target.value })}
                      placeholder={page.title || "Page title"}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`seo-desc-${page.id}`}>Meta description</FieldLabel>
                    <Input
                      id={`seo-desc-${page.id}`}
                      value={page.seo.description}
                      onChange={(event) =>
                        updatePageSeo(page.id, { description: event.target.value })
                      }
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={page.seo.noIndex}
                      onChange={(event) =>
                        updatePageSeo(page.id, { noIndex: event.target.checked })
                      }
                    />
                    Hide from search engines
                  </label>
                </div>
              </details>

              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditPage(page.id)}
                    disabled={active}
                  >
                    <PencilIcon className="size-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${page.title || "page"}`}
                    onClick={() => deletePage(page.id)}
                    disabled={!canDeletePage(page)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        <Button variant="outline" size="sm" className="self-start" onClick={addPage}>
          <PlusIcon className="size-4" /> Add page
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Navigation menu</SectionHeading>
        {value.navigation.length === 0 && (
          <p className="text-sm text-muted-foreground">No menu items yet.</p>
        )}
        {value.navigation.map((item, index) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
          >
            <Input
              value={item.label}
              onChange={(event) => updateNavItem(item.id, { label: event.target.value })}
              placeholder="Menu label"
              aria-label="Menu label"
            />
            <select
              className={selectClass}
              value={item.kind}
              aria-label="Menu item type"
              onChange={(event) =>
                updateNavItem(item.id, { kind: event.target.value as NavItemInput["kind"] })
              }
            >
              <option value="page">Page</option>
              <option value="url">URL</option>
            </select>
            {item.kind === "page" ? (
              <select
                className={selectClass}
                value={item.pageId}
                aria-label="Linked page"
                onChange={(event) => updateNavItem(item.id, { pageId: event.target.value })}
              >
                <option value="">Select a page…</option>
                {value.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title || (isHomePage(page) ? "Home" : page.slug)}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={item.href}
                onChange={(event) => updateNavItem(item.id, { href: event.target.value })}
                placeholder="https://…"
                aria-label="URL"
              />
            )}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => setNavigation(move(value.navigation, index, -1))}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={index === value.navigation.length - 1}
                onClick={() => setNavigation(move(value.navigation, index, 1))}
              >
                <ArrowDownIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove menu item"
                onClick={() => setNavigation(value.navigation.filter((nav) => nav.id !== item.id))}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={addNavItem}>
          <PlusIcon className="size-4" /> Add menu item
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Redirects</SectionHeading>
        {value.redirects.length === 0 && (
          <p className="text-sm text-muted-foreground">No redirects yet.</p>
        )}
        {value.redirects.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
          >
            <Input
              value={row.fromSlug}
              onChange={(event) => updateRedirect(row.id, { fromSlug: event.target.value })}
              placeholder="old-path"
              aria-label="Redirect from"
              className="font-mono"
            />
            <Input
              value={row.toSlug}
              onChange={(event) => updateRedirect(row.id, { toSlug: event.target.value })}
              placeholder="/ or new-path"
              aria-label="Redirect to"
              className="font-mono"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={row.permanent}
                  onChange={(event) => updateRedirect(row.id, { permanent: event.target.checked })}
                />
                Permanent
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove redirect"
                onClick={() => setRedirects(value.redirects.filter((r) => r.id !== row.id))}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={addRedirect}>
          <PlusIcon className="size-4" /> Add redirect
        </Button>
      </section>
    </div>
  )
}
