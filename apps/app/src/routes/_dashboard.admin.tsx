import { Button } from "@realtr/ui/components/button"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { LocalTime } from "../components/local-time"
import {
  type AdminBillingRow,
  type AdminIntegrationRow,
  adminDetachDomainFn,
  adminExtendGraceFn,
  adminListAuditFn,
  adminListBillingFn,
  adminListIntegrationsFn,
  adminListTenantDomainsFn,
  adminListTenantsFn,
  adminRetryLeadsFn,
  adminReverifyDomainFn,
  adminSetPausedFn,
  adminSyncFn,
} from "../server/admin"

type TenantDomain = Extract<
  Awaited<ReturnType<typeof adminListTenantDomainsFn>>,
  { ok: true }
>["domains"][number]

type TenantRow = Extract<
  Awaited<ReturnType<typeof adminListTenantsFn>>,
  { ok: true }
>["tenants"][number]
type AuditRow = Extract<
  Awaited<ReturnType<typeof adminListAuditFn>>,
  { ok: true }
>["events"][number]

export const Route = createFileRoute("/_dashboard/admin")({
  loader: async () => ({
    tenants: await adminListTenantsFn(),
    integrations: await adminListIntegrationsFn(),
    billing: await adminListBillingFn(),
    audit: await adminListAuditFn(),
  }),
  component: AdminPage,
})

function AdminPage() {
  const { tenants, integrations, billing, audit } = Route.useLoaderData()

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

      <h2 className="mt-10 font-heading text-xl font-bold">Tenants</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Every tenant at a glance — subscription, custom domains, listing/CRM integrations, listings,
        and lead delivery. Red flags surface here; drill into the sections below to act.
      </p>
      {!tenants.ok ? (
        <p className="mt-6 text-sm text-muted-foreground">Tenant data unavailable.</p>
      ) : tenants.tenants.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No tenants yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Tenant</th>
                <th className="px-3 py-2 font-medium">Subscription</th>
                <th className="px-3 py-2 font-medium">Domains</th>
                <th className="px-3 py-2 font-medium">Integrations</th>
                <th className="px-3 py-2 font-medium">Listings</th>
                <th className="px-3 py-2 font-medium">Leads</th>
                <th className="px-3 py-2 font-medium">Last sync</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tenants.tenants.map((t) => (
                <TenantHealth key={t.organizationId} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-12 font-heading text-xl font-bold">DDF sync</h2>
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

      <h2 className="mt-12 font-heading text-xl font-bold">Audit log</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Privileged operator actions (sync, pause/resume, grace extensions), most recent first.
      </p>
      {!audit.ok ? (
        <p className="mt-6 text-sm text-muted-foreground">Audit log unavailable.</p>
      ) : audit.events.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No admin actions recorded yet.</p>
      ) : (
        <div className="mt-6 flex flex-col divide-y divide-border rounded-lg border border-border">
          {audit.events.map((e) => (
            <AuditRowView key={e.id} e={e} />
          ))}
        </div>
      )}
      <Toaster />
    </main>
  )
}

function healthDot(kind: "ok" | "warn" | "bad" | "muted") {
  const color =
    kind === "ok"
      ? "bg-success"
      : kind === "warn"
        ? "bg-warning"
        : kind === "bad"
          ? "bg-destructive"
          : "bg-muted-foreground/40"
  return <span className={`inline-block size-2 shrink-0 rounded-full ${color}`} />
}

function TenantHealth({ t }: { t: TenantRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [domains, setDomains] = useState<TenantDomain[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadDomains = useCallback(async () => {
    const res = await adminListTenantDomainsFn({ data: { organizationId: t.organizationId } })
    if (res.ok) setDomains(res.domains)
  }, [t.organizationId])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && domains === null) await loadDomains()
  }

  const reverify = async (domainId: string) => {
    setBusy(`reverify:${domainId}`)
    const res = await adminReverifyDomainFn({
      data: { organizationId: t.organizationId, domainId },
    })
    setBusy(null)
    if (res.ok) {
      toast.success(`Re-verified — ${res.state}`)
      await loadDomains()
      await router.invalidate()
    } else {
      toast.error("Could not re-verify.")
    }
  }

  const detach = async (domainId: string, hostname: string) => {
    if (!window.confirm(`Detach ${hostname}? It stops serving and re-issuing its certificate.`))
      return
    setBusy(`detach:${domainId}`)
    const res = await adminDetachDomainFn({ data: { organizationId: t.organizationId, domainId } })
    setBusy(null)
    if (res.ok) {
      toast.success(`Detached ${hostname}`)
      await loadDomains()
      await router.invalidate()
    } else {
      toast.error("Could not detach.")
    }
  }

  const retryLeads = async () => {
    setBusy("leads")
    const res = await adminRetryLeadsFn({ data: { organizationId: t.organizationId } })
    setBusy(null)
    if (res.ok) {
      toast.success(
        res.requeued > 0 ? `Re-queued ${res.requeued} lead(s)` : "No failed leads to retry",
      )
      await router.invalidate()
    } else {
      toast.error("Could not retry deliveries.")
    }
  }

  const setPaused = async (paused: boolean) => {
    setBusy("pause")
    const res = await adminSetPausedFn({ data: { organizationId: t.organizationId, paused } })
    setBusy(null)
    if (res.ok) {
      toast.success(paused ? "Sync paused" : "Sync resumed")
      await router.invalidate()
    } else {
      toast.error("Could not update sync.")
    }
  }

  const subKind =
    t.subscriptionStatus === "active" || t.subscriptionStatus === "trialing"
      ? "ok"
      : t.subscriptionStatus === "past_due" || t.subscriptionStatus === "grace"
        ? "warn"
        : t.subscriptionStatus === "lapsed" || t.subscriptionStatus === "canceled"
          ? "bad"
          : "muted"
  const domainKind =
    t.domainWorstStatus === null
      ? "muted"
      : t.domainWorstStatus === "active" || t.domainWorstStatus === "verified"
        ? "ok"
        : t.domainWorstStatus === "error"
          ? "bad"
          : "warn"
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-3 py-2">
          <div className="font-medium">{t.organizationName}</div>
          <div className="text-xs text-muted-foreground">
            {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
          </div>
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1.5">
            {healthDot(subKind)}
            {t.subscriptionStatus}
            {t.planId ? <span className="text-muted-foreground"> · {t.planId}</span> : null}
          </span>
        </td>
        <td className="px-3 py-2">
          {t.domainCount === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {healthDot(domainKind)}
              {t.domainCount} ({t.domainWorstStatus})
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            {healthDot(t.ddfConnected ? "ok" : "muted")} DDF
          </span>
          <span className="ml-2 inline-flex items-center gap-1.5">
            {healthDot(t.crmConnected ? "ok" : "muted")} CRM
          </span>
        </td>
        <td className="px-3 py-2">{t.activeListings}</td>
        <td className="px-3 py-2">
          {t.leadCount}
          {t.undeliveredLeads > 0 ? (
            <span className="ml-1.5 inline-flex items-center gap-1 text-warning">
              {healthDot("warn")}
              {t.undeliveredLeads} undelivered
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {t.lastSyncAt ? (
            <>
              {t.lastSyncStatus === "failed" ? healthDot("bad") : healthDot("ok")}{" "}
              <LocalTime iso={t.lastSyncAt} />
            </>
          ) : (
            "never"
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="ghost" onClick={() => void toggle()}>
            {open ? "Close" : "Manage"}
          </Button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={8} className="border-t border-border bg-muted/20 px-3 py-4">
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Custom domains
                </div>
                {domains === null ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : domains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No custom domains.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {domains.map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
                      >
                        <span className="font-mono text-sm">
                          {d.hostname}{" "}
                          <span className="text-xs text-muted-foreground">({d.status})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null || d.status === "detached"}
                            onClick={() => void reverify(d.id)}
                          >
                            {busy === `reverify:${d.id}` ? "Verifying…" : "Re-verify"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null || d.status === "detached"}
                            onClick={() => void detach(d.id, d.hostname)}
                          >
                            {busy === `detach:${d.id}` ? "Detaching…" : "Detach"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void retryLeads()}
                >
                  {busy === "leads" ? "Re-queuing…" : "Retry failed lead deliveries"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void setPaused(true)}
                >
                  Pause sync
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void setPaused(false)}
                >
                  Resume sync
                </Button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function AuditRowView({ e }: { e: AuditRow }) {
  const detailObject =
    e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {}
  const detail = Object.entries(detailObject)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" ")
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{e.action}</span>
        {e.organizationName ? <span className="font-medium">{e.organizationName}</span> : null}
        {detail ? <span className="font-mono text-xs text-muted-foreground">{detail}</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">
        {e.actorEmail} · <LocalTime iso={e.createdAt} />
      </div>
    </div>
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
