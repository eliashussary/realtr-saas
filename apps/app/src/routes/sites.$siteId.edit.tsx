import "@measured/puck/puck.css"
import { Puck, usePuck } from "@measured/puck"
import type { Data } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { type SiteDocumentV1, resolveNavigation } from "@realtr/site/document"
import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
import { Toaster } from "@realtr/ui/components/sonner"
import { type ThemeTokens, themeToCssVars } from "@realtr/ui/tokens"
import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  LayoutTemplateIcon,
  Redo2Icon,
  Settings2Icon,
  Undo2Icon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PagesNavPanel } from "../components/pages-nav-panel"
import {
  type BrandingInput,
  brandingFromDocument,
  cleanBrandingInput,
} from "../components/site-settings"
import { SiteSettingsDialog } from "../components/site-settings-dialog"
import {
  type StructureInput,
  cleanStructure,
  isHomePage,
  structureFromDocument,
} from "../components/site-structure"
import { TemplatePickerDialog } from "../components/template-picker-dialog"
import { can } from "../lib/permissions"
import { issuePreviewFn, loadSiteDraftFn, publishSiteFn, saveSiteDraftFn } from "../server/site-fns"

interface EditorPage {
  id: string
  slug: string
  title: string
  status?: "active" | "hidden"
  seo?: { title?: string; description?: string; noIndex?: boolean }
  puck: Data
}
interface EditorSettings {
  siteTitle?: string
  logoAssetId?: string
  contact?: { email?: string; phone?: string }
  socialLinks?: Array<{ id: string; service: string; url: string }>
}
interface EditorDocument {
  template: { id: string; schemaVersion?: number }
  pages: EditorPage[]
  navigation?: Array<{ id: string; label: string; pageId?: string; href?: string }>
  redirects?: Array<{ id: string; fromSlug: string; toSlug: string; permanent: boolean }>
  settings?: EditorSettings
  theme?: ThemeTokens
  [key: string]: unknown
}

export const Route = createFileRoute("/sites/$siteId/edit")({
  loader: async ({ params }) => {
    const data = await loadSiteDraftFn({ data: { siteId: params.siteId } })
    if (!data.ok && data.code === "unauthorized") throw redirect({ to: "/login" })
    return data
  },
  component: EditorRoute,
})

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted-foreground">
      {message}
    </div>
  )
}

function EditorRoute() {
  const data = Route.useLoaderData()
  const { siteId } = Route.useParams()
  if (!data.ok) {
    return (
      <Unavailable
        message={
          data.code === "not_found"
            ? "This site could not be found."
            : "You do not have access to this site."
        }
      />
    )
  }
  return (
    <Editor
      siteId={siteId}
      initialDocument={data.document as unknown as EditorDocument}
      initialVersion={data.draftVersion}
      role={data.role}
    />
  )
}

type SaveState = "idle" | "saving" | "saved" | "conflict" | "invalid" | "error"

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Up to date",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Conflict",
  invalid: "Invalid — not saved",
  error: "Save failed",
}

function Editor({
  siteId,
  initialDocument,
  initialVersion,
  role,
}: {
  siteId: string
  initialDocument: EditorDocument
  initialVersion: string
  role: string
}) {
  const canPublish = can(role, "site", "publish")
  const docRef = useRef<EditorDocument>(initialDocument)
  const versionRef = useRef(initialVersion)
  const conflictRef = useRef(false)
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [currentPageId, setCurrentPageId] = useState(() => {
    const home = initialDocument.pages.find((page) => page.slug === "")
    return home?.id ?? initialDocument.pages[0]?.id ?? ""
  })
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [version, setVersion] = useState(initialVersion)
  const [mounted, setMounted] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateId, setTemplateId] = useState(initialDocument.template.id)
  // Left editor rail: "components" is Puck's drag list + outline; "pages" is the pages/nav/redirects
  // panel. Leaving the Pages tab refreshes the canvas (see changeLeftTab) the way closing the old
  // dialog used to.
  const [leftTab, setLeftTab] = useState<"components" | "pages">("components")
  const [structure, setStructure] = useState<StructureInput>(() =>
    structureFromDocument(initialDocument),
  )
  // Bumped when the pages/navigation panel closes so the canvas remounts and reflects structural
  // edits (menu, page renames/removals) that Puck — being uncontrolled after mount — would not pick
  // up from a changed data prop alone.
  const [structureRev, setStructureRev] = useState(0)
  const [branding, setBranding] = useState<BrandingInput>(() =>
    brandingFromDocument(initialDocument),
  )
  const brandingRef = useRef(branding)
  // The preview canvas reads its theme from `previewTheme`, committed only when the settings panel
  // closes. Puck 0.18 renders the canvas in an iframe, so theme vars must flow through its config;
  // recomputing that config on every keystroke would re-sync Puck and reset its undo history, so we
  // hold the committed value steady while the (canvas-covering) settings dialog is open.
  const [previewTheme, setPreviewTheme] = useState<ThemeTokens>(
    () => (initialDocument.theme ?? {}) as ThemeTokens,
  )
  useEffect(() => setMounted(true), [])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const save = useCallback(async () => {
    if (conflictRef.current) return
    dirtyRef.current = false
    setSaveState("saving")
    const res = await saveSiteDraftFn({
      data: { siteId, expectedDraftVersion: versionRef.current, document: docRef.current },
    })
    if (res.ok) {
      versionRef.current = res.draftVersion
      setVersion(res.draftVersion)
      setSaveState("saved")
    } else if (res.code === "stale") {
      conflictRef.current = true
      setSaveState("conflict")
    } else if (res.code === "invalid") {
      setSaveState("invalid")
    } else {
      setSaveState("error")
    }
  }, [siteId])

  // Flush any pending debounced save so publish/preview act on the latest draft version.
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (dirtyRef.current) await save()
  }, [save])

  // Mark the draft dirty and debounce a save. Shared by block edits and settings edits so both
  // paths get the same autosave, conflict handling, and status labels.
  const scheduleSave = useCallback(() => {
    if (conflictRef.current) return
    dirtyRef.current = true
    setSaveState("idle")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 800)
  }, [save])

  const onPuckChange = useCallback(
    (next: Data) => {
      const pages = docRef.current.pages.map((page) =>
        page.id === currentPageId ? { ...page, puck: next } : page,
      )
      docRef.current = { ...docRef.current, pages }
      scheduleSave()
    },
    [currentPageId, scheduleSave],
  )

  // Apply a pages/navigation/redirects edit: reconcile the document's pages (carrying block content
  // over by id, in the panel's order) and persist cleaned navigation/redirects. If the page being
  // edited was removed, fall back to the home page so the canvas always has a valid target.
  const applyStructure = useCallback(
    (next: StructureInput) => {
      setStructure(next)
      const clean = cleanStructure(next, docRef.current.pages)
      docRef.current = {
        ...docRef.current,
        pages: clean.pages,
        navigation: clean.navigation,
        redirects: clean.redirects,
      }
      if (!clean.pages.some((page) => page.id === currentPageId)) {
        const fallback = clean.pages.find(isHomePage) ?? clean.pages[0]
        if (fallback) setCurrentPageId(fallback.id)
      }
      scheduleSave()
    },
    [currentPageId, scheduleSave],
  )

  // "Edit" a page from the Pages tab: make it the active page, switch to the Components tab to edit
  // its blocks, and remount the canvas so it shows that page.
  const editPage = useCallback((id: string) => {
    setCurrentPageId(id)
    setLeftTab("components")
    setStructureRev((rev) => rev + 1)
  }, [])

  // Switching tabs: leaving Pages refreshes the canvas so it reflects menu/page edits (Puck is
  // uncontrolled after mount), mirroring what closing the old pages dialog did.
  const changeLeftTab = useCallback((tab: "components" | "pages") => {
    setLeftTab((prev) => {
      if (prev === "pages" && tab !== "pages") setStructureRev((rev) => rev + 1)
      return tab
    })
  }, [])

  // Switch templates in place: content and theme are shared across templates (same block registry),
  // so only the template id/version change. Bumping structureRev remounts the canvas with the new
  // layout's config and Root.
  const applyTemplate = useCallback(
    (id: string) => {
      if (id === docRef.current.template.id) return
      docRef.current = {
        ...docRef.current,
        template: { id, schemaVersion: getTemplate(id).schemaVersion },
      }
      setTemplateId(id)
      setStructureRev((rev) => rev + 1)
      scheduleSave()
    },
    [scheduleSave],
  )

  const applyBranding = useCallback(
    (next: BrandingInput) => {
      setBranding(next)
      brandingRef.current = next
      const clean = cleanBrandingInput(next)
      docRef.current = { ...docRef.current, settings: clean.settings, theme: clean.theme }
      scheduleSave()
    },
    [scheduleSave],
  )

  const onSettingsOpenChange = useCallback((open: boolean) => {
    setSettingsOpen(open)
    // Reflect the edited theme in the canvas once the panel closes.
    if (!open) setPreviewTheme(cleanBrandingInput(brandingRef.current).theme)
  }, [])

  const preview = useCallback(async () => {
    await flush()
    const res = await issuePreviewFn({ data: { siteId, expectedDraftVersion: versionRef.current } })
    if (res.ok) window.open(res.url, "_blank", "noopener")
    else if (res.code === "stale") toast.error("Draft changed — try preview again.")
    else toast.error("Could not create a preview link.")
  }, [flush, siteId])

  const publish = useCallback(async () => {
    setPublishing(true)
    await flush()
    const res = await publishSiteFn({ data: { siteId, expectedDraftVersion: versionRef.current } })
    setPublishing(false)
    setPublishOpen(false)
    if (res.ok) toast.success(`Published — publication ${res.publicationNumber}.`)
    else if (res.code === "stale") toast.error("Draft changed — reload before publishing.")
    else if (res.code === "invalid") toast.error("Fix validation issues before publishing.")
    else if (res.code === "forbidden") toast.error("You do not have permission to publish.")
    else if (res.code === "payment_required")
      toast.error("Your subscription is inactive. Update billing to publish.")
    else toast.error("Publish failed.")
  }, [flush, siteId])

  // Stable identities: Puck is uncontrolled after mount, so a new config/data object on every render
  // (e.g. each autosave setState) makes it re-sync and flicker. `key={currentPageId}` remounts Puck
  // with the right page's seed data when the active page changes, and keeps the same page mounted
  // across reorders/renames. `templateId` is state so a template switch rebuilds the config.
  // The tenant theme is applied to the preview so the canvas matches the published renderer. It
  // tracks `previewTheme`, which the settings panel commits on close (see the state declaration).
  const themeStyle = useMemo(
    () => themeToCssVars(previewTheme) as React.CSSProperties,
    [previewTheme],
  )
  const config = useMemo(() => {
    const base = getTemplate(templateId).buildConfig()
    const baseRender = base.root?.render
    return {
      ...base,
      root: {
        ...base.root,
        render: (props: { children?: React.ReactNode } & Record<string, unknown>) => (
          <div className="tenant-preview" style={themeStyle}>
            {/* biome-ignore lint/suspicious/noExplicitAny: Puck root render prop passthrough */}
            {baseRender ? baseRender(props as any) : props.children}
          </div>
        ),
      },
    }
  }, [templateId, themeStyle])
  const initialData = useMemo<Data>(() => {
    // `structureRev` gates this memo: bumping it on panel close forces a recompute + Puck remount so
    // the canvas reflects structural edits (menu, renames, removals) it would otherwise miss.
    void structureRev
    const puck =
      docRef.current.pages.find((page) => page.id === currentPageId)?.puck ??
      ({ content: [], root: {} } as Data)
    // Mirror the renderer: inject document-level navigation into the page's root props so the
    // preview header shows the real menu.
    const nav = resolveNavigation(docRef.current as unknown as SiteDocumentV1)
    return { ...puck, root: { ...puck.root, props: { ...puck.root?.props, nav } } }
  }, [currentPageId, structureRev])
  const siteTitle = branding.settings.siteTitle.trim() || docRef.current.pages[0]?.title || "Site"
  const pageTabs = useMemo(
    () => structure.pages.map((page) => ({ id: page.id, title: page.title, slug: page.slug })),
    [structure.pages],
  )
  if (!mounted) return <Unavailable message="Loading editor…" />

  return (
    <div className="flex h-screen flex-col">
      {saveState === "conflict" && (
        <div className="flex items-center justify-between gap-4 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>A newer version was saved elsewhere. Reload to get the latest draft.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )}
      <div className="realtr-editor min-h-0 flex-1">
        <Puck
          key={`${currentPageId}:${structureRev}`}
          config={config}
          data={initialData}
          onChange={onPuckChange}
        >
          <div className="flex h-full flex-col">
            <EditorHeader
              siteTitle={siteTitle}
              pages={pageTabs}
              currentPageId={currentPageId}
              onPageChange={setCurrentPageId}
              saveState={saveState}
              version={version}
              canPublish={canPublish}
              onPreview={() => void preview()}
              onPublish={() => setPublishOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenTemplate={() => setTemplateOpen(true)}
            />
            <div className="flex min-h-0 flex-1">
              <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background">
                <div className="flex shrink-0 border-b border-border">
                  <LeftTab
                    label="Pages"
                    active={leftTab === "pages"}
                    onClick={() => changeLeftTab("pages")}
                  />
                  <LeftTab
                    label="Components"
                    active={leftTab === "components"}
                    onClick={() => changeLeftTab("components")}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {leftTab === "pages" ? (
                    <PagesNavPanel
                      value={structure}
                      onChange={applyStructure}
                      currentPageId={currentPageId}
                      onEditPage={editPage}
                    />
                  ) : (
                    <>
                      <Puck.Components />
                      <Puck.Outline />
                    </>
                  )}
                </div>
              </aside>
              <div className="min-w-0 flex-1">
                <Puck.Preview />
              </div>
              <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background">
                <Puck.Fields />
              </aside>
            </div>
          </div>
        </Puck>
      </div>
      <SiteSettingsDialog
        open={settingsOpen}
        onOpenChange={onSettingsOpenChange}
        value={branding}
        onChange={applyBranding}
      />
      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        currentId={templateId}
        onSelect={applyTemplate}
      />
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish these changes?</DialogTitle>
            <DialogDescription>
              Visitors will see the current draft as soon as publication completes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void publish()} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster />
    </div>
  )
}

function LeftTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

function EditorHeader({
  siteTitle,
  pages,
  currentPageId,
  onPageChange,
  saveState,
  version,
  canPublish,
  onPreview,
  onPublish,
  onOpenSettings,
  onOpenTemplate,
}: {
  siteTitle: string
  pages: Array<{ id: string; title: string; slug: string }>
  currentPageId: string
  onPageChange: (id: string) => void
  saveState: SaveState
  version: string
  canPublish: boolean
  onPreview: () => void
  onPublish: () => void
  onOpenSettings: () => void
  onOpenTemplate: () => void
}) {
  const { history } = usePuck()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Dashboard
        </Link>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <span className="truncate font-heading text-sm font-semibold text-foreground">
          {siteTitle}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Undo"
            disabled={!history.hasPast}
            onClick={() => history.back()}
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Redo"
            disabled={!history.hasFuture}
            onClick={() => history.forward()}
          >
            <Redo2Icon className="size-4" />
          </Button>
        </div>
        {pages.length > 1 && (
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="Edit page"
            value={currentPageId}
            onChange={(event) => onPageChange(event.target.value)}
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || page.slug || "Home"}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Template" onClick={onOpenTemplate}>
          <LayoutTemplateIcon className="size-4" />
        </Button>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">v{version}</span>
          {SAVE_LABEL[saveState]}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Site settings" onClick={onOpenSettings}>
          <Settings2Icon className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onPreview}>
          Preview
        </Button>
        {canPublish && (
          <Button size="sm" onClick={onPublish}>
            Publish
          </Button>
        )}
      </div>
    </header>
  )
}
