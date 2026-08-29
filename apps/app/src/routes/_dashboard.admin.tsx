import { Button } from "@realtr/ui/components/button"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { LocalTime } from "../components/local-time"
import {
  type AdminIntegrationRow,
  adminListIntegrationsFn,
  adminSetPausedFn,
  adminSyncFn,
} from "../server/admin"

export const Route = createFileRoute("/_dashboard/admin")({
  loader: () => adminListIntegrationsFn(),
  component: AdminPage,
})

function AdminPage() {
  const data = Route.useLoaderData()

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The admin console is limited to platform administrators.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Super admin</p>
          <h1 className="font-heading text-3xl font-bold">DDF sync console</h1>
        </div>
        <Link to="/" className="text-sm text-brand hover:underline">
          ← Dashboard
        </Link>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Scheduled syncs run automatically (incremental hourly, full reconciliation daily). Pause a
        tenant to skip it, or trigger a sync immediately.
      </p>

      {data.integrations.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No DDF integrations yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {data.integrations.map((row) => (
            <IntegrationRow key={row.organizationId} row={row} />
          ))}
        </div>
      )}
      <Toaster />
    </main>
  )
}

function IntegrationRow({ row }: { row: AdminIntegrationRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"incremental" | "reconcile" | "pause" | null>(null)

  const sync = async (mode: "incremental" | "reconcile") => {
    setBusy(mode)
    const res = await adminSyncFn({ data: { organizationId: row.organizationId, mode } })
    setBusy(null)
    if (res.ok) {
      toast.success(`${row.organizationName}: +${res.upserted} / -${res.removed}`)
      await router.invalidate()
    } else {
      toast.error(`Sync failed${"message" in res && res.message ? `: ${res.message}` : ""}`)
    }
  }

  const setPaused = async (paused: boolean) => {
    setBusy("pause")
    const res = await adminSetPausedFn({ data: { organizationId: row.organizationId, paused } })
    setBusy(null)
    if (res.ok) await router.invalidate()
    else toast.error("Could not update.")
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.organizationName}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {row.status}
          </span>
          {row.syncPaused ? (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              paused
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {row.activeListings} active listings
          {row.lastSync?.finishedAt ? (
            <>
              {" · "}last {row.lastSync.mode} <LocalTime iso={row.lastSync.finishedAt} />
              {row.lastSync.status === "failed"
                ? ` — failed${row.lastSync.error ? `: ${row.lastSync.error}` : ""}`
                : ` (+${row.lastSync.upserted} / -${row.lastSync.removed})`}
            </>
          ) : (
            " · no sync yet"
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void sync("incremental")} disabled={busy !== null}>
          {busy === "incremental" ? "Syncing…" : "Sync now"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void sync("reconcile")}
          disabled={busy !== null}
        >
          {busy === "reconcile" ? "Reconciling…" : "Reconcile"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void setPaused(!row.syncPaused)}
          disabled={busy !== null}
        >
          {row.syncPaused ? "Resume" : "Pause"}
        </Button>
      </div>
    </div>
  )
}
