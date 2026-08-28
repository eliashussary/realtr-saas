import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
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

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-heading text-sm font-semibold text-foreground">{children}</h3>
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

export function PagesNavDialog({
  open,
  onOpenChange,
  value,
  onChange,
  currentPageId,
  onEditPage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pages & navigation</DialogTitle>
          <DialogDescription>
            Manage pages, the site menu, and redirects. Changes save automatically; publish to make
            them public.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-1">
          <section className="flex flex-col gap-3">
            <SectionHeading>Pages</SectionHeading>
            {value.pages.map((page) => {
              const home = isHomePage(page)
              const path = home ? "/" : `/${toSlug(page.slug) || "…"}`
              return (
                <div
                  key={page.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <Field className="min-w-40 flex-1">
                      <FieldLabel htmlFor={`page-title-${page.id}`}>Title</FieldLabel>
                      <Input
                        id={`page-title-${page.id}`}
                        value={page.title}
                        onChange={(event) => updatePage(page.id, { title: event.target.value })}
                        aria-invalid={page.title.trim() === "" || undefined}
                      />
                    </Field>
                    <Field className="min-w-40 flex-1">
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
                    <Field className="w-28">
                      <FieldLabel htmlFor={`page-status-${page.id}`}>Status</FieldLabel>
                      <select
                        id={`page-status-${page.id}`}
                        className={selectClass}
                        value={page.status}
                        onChange={(event) =>
                          updatePage(page.id, {
                            status: event.target.value as PageMetaInput["status"],
                          })
                        }
                      >
                        <option value="active">Active</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </Field>
                  </div>

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
                          onChange={(event) =>
                            updatePageSeo(page.id, { title: event.target.value })
                          }
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
                        Hide this page from search engines
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
                        disabled={page.id === currentPageId}
                      >
                        <PencilIcon className="size-4" /> Edit content
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
            <div>
              <Button variant="outline" size="sm" onClick={addPage}>
                <PlusIcon className="size-4" /> Add page
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading>Navigation menu</SectionHeading>
            {value.navigation.length === 0 && (
              <p className="text-sm text-muted-foreground">No menu items yet.</p>
            )}
            {value.navigation.map((item, index) => (
              <div key={item.id} className="flex flex-wrap items-end gap-2">
                <Field className="min-w-32 flex-1">
                  <FieldLabel htmlFor={`nav-label-${item.id}`} className="sr-only">
                    Label
                  </FieldLabel>
                  <Input
                    id={`nav-label-${item.id}`}
                    value={item.label}
                    onChange={(event) => updateNavItem(item.id, { label: event.target.value })}
                    placeholder="Menu label"
                  />
                </Field>
                <Field className="w-24">
                  <FieldLabel htmlFor={`nav-kind-${item.id}`} className="sr-only">
                    Type
                  </FieldLabel>
                  <select
                    id={`nav-kind-${item.id}`}
                    className={selectClass}
                    value={item.kind}
                    onChange={(event) =>
                      updateNavItem(item.id, { kind: event.target.value as NavItemInput["kind"] })
                    }
                  >
                    <option value="page">Page</option>
                    <option value="url">URL</option>
                  </select>
                </Field>
                {item.kind === "page" ? (
                  <Field className="min-w-40 flex-1">
                    <FieldLabel htmlFor={`nav-page-${item.id}`} className="sr-only">
                      Page
                    </FieldLabel>
                    <select
                      id={`nav-page-${item.id}`}
                      className={selectClass}
                      value={item.pageId}
                      onChange={(event) => updateNavItem(item.id, { pageId: event.target.value })}
                    >
                      <option value="">Select a page…</option>
                      {value.pages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.title || (isHomePage(page) ? "Home" : page.slug)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field className="min-w-40 flex-1">
                    <FieldLabel htmlFor={`nav-href-${item.id}`} className="sr-only">
                      URL
                    </FieldLabel>
                    <Input
                      id={`nav-href-${item.id}`}
                      value={item.href}
                      onChange={(event) => updateNavItem(item.id, { href: event.target.value })}
                      placeholder="https://…"
                    />
                  </Field>
                )}
                <div className="flex items-center">
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
                    onClick={() =>
                      setNavigation(value.navigation.filter((nav) => nav.id !== item.id))
                    }
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button variant="outline" size="sm" onClick={addNavItem}>
                <PlusIcon className="size-4" /> Add menu item
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading>Redirects</SectionHeading>
            {value.redirects.length === 0 && (
              <p className="text-sm text-muted-foreground">No redirects yet.</p>
            )}
            {value.redirects.map((row) => (
              <div key={row.id} className="flex flex-wrap items-end gap-2">
                <Field className="min-w-32 flex-1">
                  <FieldLabel htmlFor={`redirect-from-${row.id}`} className="sr-only">
                    From
                  </FieldLabel>
                  <Input
                    id={`redirect-from-${row.id}`}
                    value={row.fromSlug}
                    onChange={(event) => updateRedirect(row.id, { fromSlug: event.target.value })}
                    placeholder="old-path"
                    className="font-mono"
                  />
                </Field>
                <span className="pb-1.5 text-muted-foreground">→</span>
                <Field className="min-w-32 flex-1">
                  <FieldLabel htmlFor={`redirect-to-${row.id}`} className="sr-only">
                    To
                  </FieldLabel>
                  <Input
                    id={`redirect-to-${row.id}`}
                    value={row.toSlug}
                    onChange={(event) => updateRedirect(row.id, { toSlug: event.target.value })}
                    placeholder="/ or new-path"
                    className="font-mono"
                  />
                </Field>
                <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={row.permanent}
                    onChange={(event) =>
                      updateRedirect(row.id, { permanent: event.target.checked })
                    }
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
            ))}
            <div>
              <Button variant="outline" size="sm" onClick={addRedirect}>
                <PlusIcon className="size-4" /> Add redirect
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
