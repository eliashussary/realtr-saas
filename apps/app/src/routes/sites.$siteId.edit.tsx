import "@measured/puck/puck.css"
import { Puck } from "@measured/puck"
import type { Data } from "@measured/puck"
import { getTemplate } from "@realtr/site"
import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realtr/ui/components/dialog"
import { Toaster } from "@realtr/ui/components/sonner"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { issuePreviewFn, loadSiteDraftFn, publishSiteFn, saveSiteDraftFn } from "../server/site-fns"

interface EditorPage {
  id: string
  slug: string
  title: string
  puck: Data
}
interface EditorDocument {
  template: { id: string }
  pages: EditorPage[]
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
  const canPublish = role === "owner" || role === "admin"
  const docRef = useRef<EditorDocument>(initialDocument)
  const versionRef = useRef(initialVersion)
  const conflictRef = useRef(false)
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pageIndex, setPageIndex] = useState(() => {
    const home = initialDocument.pages.findIndex((page) => page.slug === "")
    return home >= 0 ? home : 0
  })
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const save = useCallback(
    async (override = false) => {
      if (conflictRef.current && !override) return
      dirtyRef.current = false
      setSaveState("saving")
      const res = await saveSiteDraftFn({
        data: {
          siteId,
          expectedDraftVersion: versionRef.current,
          document: docRef.current,
          override,
        },
      })
      if (res.ok) {
        versionRef.current = res.draftVersion
        conflictRef.current = false
        setSaveState("saved")
      } else if (res.code === "stale") {
        conflictRef.current = true
        setSaveState("conflict")
      } else if (res.code === "invalid") {
        setSaveState("invalid")
      } else {
        setSaveState("error")
      }
    },
    [siteId],
  )

  // Flush any pending debounced save so publish/preview act on the latest draft version.
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (dirtyRef.current) await save()
  }, [save])

  const onPuckChange = useCallback(
    (next: Data) => {
      const pages = docRef.current.pages.map((page, index) =>
        index === pageIndex ? { ...page, puck: next } : page,
      )
      docRef.current = { ...docRef.current, pages }
      if (conflictRef.current) return
      dirtyRef.current = true
      setSaveState("idle")
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), 800)
    },
    [pageIndex, save],
  )

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const config = getTemplate(docRef.current.template.id).buildConfig()

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
      <div className="min-h-0 flex-1">
        <Puck
          key={pageIndex}
          config={config}
          data={docRef.current.pages[pageIndex]?.puck ?? { content: [] }}
          onChange={onPuckChange}
          overrides={{
            headerActions: () => (
              <Toolbar
                siteId={siteId}
                pages={docRef.current.pages}
                pageIndex={pageIndex}
                onPageChange={setPageIndex}
                saveState={saveState}
                canPublish={canPublish}
                flush={flush}
                versionRef={versionRef}
              />
            ),
          }}
        />
      </div>
      <Toaster />
    </div>
  )
}

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Up to date",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Conflict",
  invalid: "Invalid — not saved",
  error: "Save failed",
}

function Toolbar({
  siteId,
  pages,
  pageIndex,
  onPageChange,
  saveState,
  canPublish,
  flush,
  versionRef,
}: {
  siteId: string
  pages: EditorPage[]
  pageIndex: number
  onPageChange: (index: number) => void
  saveState: SaveState
  canPublish: boolean
  flush: () => Promise<void>
  versionRef: React.RefObject<string>
}) {
  const [publishing, setPublishing] = useState(false)

  async function preview() {
    await flush()
    const res = await issuePreviewFn({
      data: { siteId, expectedDraftVersion: versionRef.current },
    })
    if (res.ok) window.open(res.url, "_blank", "noopener")
    else if (res.code === "stale") toast.error("Draft changed — try preview again.")
    else toast.error("Could not create a preview link.")
  }

  async function publish() {
    setPublishing(true)
    await flush()
    const res = await publishSiteFn({
      data: { siteId, expectedDraftVersion: versionRef.current },
    })
    setPublishing(false)
    if (res.ok) toast.success(`Published — publication ${res.publicationNumber}.`)
    else if (res.code === "stale") toast.error("Draft changed — reload before publishing.")
    else if (res.code === "invalid") toast.error("Fix validation issues before publishing.")
    else if (res.code === "forbidden") toast.error("You do not have permission to publish.")
    else toast.error("Publish failed.")
  }

  return (
    <div className="flex items-center gap-3">
      {pages.length > 1 && (
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={pageIndex}
          onChange={(event) => onPageChange(Number(event.target.value))}
        >
          {pages.map((page, index) => (
            <option key={page.id} value={index}>
              {page.title || page.slug || "Home"}
            </option>
          ))}
        </select>
      )}
      <span className="text-xs text-muted-foreground">{SAVE_LABEL[saveState]}</span>
      <Button variant="outline" size="sm" onClick={() => void preview()}>
        Preview
      </Button>
      {canPublish && (
        <Dialog>
          <DialogTrigger render={<Button size="sm" disabled={publishing} />}>Publish</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish these changes?</DialogTitle>
              <DialogDescription>
                Visitors will see the current draft as soon as publication completes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <DialogClose render={<Button onClick={() => void publish()} />}>Publish</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
