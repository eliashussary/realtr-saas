import { Button } from "@realtr/ui/components/button"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { LocalTime } from "../components/local-time"
import {
  type AdminBillingRow,
  type AdminIntegrationRow,
  adminExtendGraceFn,
  adminListBillingFn,
  adminListIntegrationsFn,
  adminSetPausedFn,
  adminSyncFn,
} from "../server/admin"

export const Route = createFileRoute("/_dashboard/admin")({
  loader: async () => ({
    integrations: await adminListIntegrationsFn(),
    billing: await adminListBillingFn(),
  }),
  component: AdminPage,
})

function AdminPage() {
  const { integrations, billing } = Route.useLoaderData()

  if (!integrations.ok) {
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
          <h1 className="font-heading text-3xl font-bold">Operations console</h1>
        </div>
        <Link to="/" className="text-sm text-brand hover:underline">
          ← Dashboard
        </Link>
      </div>

      <h2 className="mt-10 font-heading text-xl font-bold">DDF sync</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Scheduled syncs run automatically (incremental hourly, full reconciliation daily). Pause a
        tenant to skip it, or trigger a sync immediately.
      </p>

      {integrations.integrations.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No DDF integrations yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {integrations.integrations.map((row) => (
            <IntegrationRow key={row.organizationId} row={row} />
          ))}
        </div>
      )}

      <h2 className="mt-12 font-heading text-xl font-bold">Billing</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Reconcile each tenant to its Stripe customer and subscription, review recent webhook events,
        and extend a past-due tenant's grace window before it lapses.
      </p>
      {!billing.ok ? (
        <p className="mt-6 text-sm text-muted-foreground">Billing data unavailable.</p>
      ) : billing.subscriptions.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No subscriptions yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {billing.subscriptions.map((row) => (
            <BillingRow key={row.organizationId} row={row} />
          ))}
        </div>
      )}
      <Toaster />
    </main>
  )
}

function BillingRow({ row }: { row: AdminBillingRow }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const extendGrace = async () => {
    setBusy(true)
    const res = await adminExtendGraceFn({ data: { organizationId: row.organizationId, days: 7 } })
    setBusy(false)
    if (res.ok) {
      toast.success(`${row.organizationName}: grace extended 7 days`)
      await router.invalidate()
    } else {
      toast.error("Could not extend grace.")
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.organizationName}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {row.status}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {row.planId}
            {row.seatQuantity > 0
              ? ` +${row.seatQuantity} seat${row.seatQuantity > 1 ? "s" : ""}`
              : ""}
          </span>
          {row.cancelAtPeriodEnd ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              cancels at period end
            </span>
          ) : null}
        </div>
        {row.status === "past_due" ? (
          <Button size="sm" variant="outline" onClick={() => void extendGrace()} disabled={busy}>
            {busy ? "Extending…" : "Extend grace 7d"}
          </Button>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="inline font-medium">Customer:</dt>{" "}
          <dd className="inline">{row.stripeCustomerId ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Subscription:</dt>{" "}
          <dd className="inline">{row.stripeSubscriptionId ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Renews:</dt>{" "}
          <dd className="inline">
            {row.currentPeriodEnd ? <LocalTime iso={row.currentPeriodEnd} /> : "—"}
          </dd>
        </div>
        {row.graceEndsAt ? (
          <div>
            <dt className="inline font-medium">Grace ends:</dt>{" "}
            <dd className="inline">
              <LocalTime iso={row.graceEndsAt} />
            </dd>
          </div>
        ) : null}
      </dl>
      {row.recentEvents.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Recent: {row.recentEvents.map((e) => e.type).join(", ")}
        </p>
      ) : null}
    </div>
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
