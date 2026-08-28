import { Button, Card, CardContent, CardHeader, CardTitle } from "@realtr/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { type FormEvent, type ReactNode, useState } from "react"
import { authClient } from "../lib/auth-client"
import { discardDraftFn, rollbackSiteFn } from "../server/site-fns"
import {
  type DashboardSite,
  addDomain,
  changeSubdomain,
  getDashboard,
  removeDomain,
} from "../server/tenant"

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const Route = createFileRoute("/")({
  loader: async () => {
    const data = await getDashboard()
    if (!data) throw redirect({ to: "/login" })
    return data
  },
  component: Dashboard,
})

function Dashboard() {
  const { orgName, baseHost, platformHost, canManage, sites } = Route.useLoaderData()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{orgName}</p>
          <h1 className="font-heading text-3xl font-bold">Your sites</h1>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            baseHost={baseHost}
            platformHost={platformHost}
            canManage={canManage}
          />
        ))}
      </div>
    </main>
  )
}

function SiteCard({
  site,
  baseHost,
  platformHost,
  canManage,
}: { site: DashboardSite; baseHost: string; platformHost: string; canManage: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{site.name}</CardTitle>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            template: {site.templateId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href={site.previewUrl} className="text-sm text-brand" target="_blank" rel="noreferrer">
            {site.previewUrl} ↗
          </a>
          {site.published ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
              Live
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              Draft — publish to go live
            </span>
          )}
        </div>
        <Link to="/sites/$siteId/edit" params={{ siteId: site.id }} className="mt-2 inline-block">
          <Button size="sm">Edit site</Button>
        </Link>
      </CardHeader>
      <CardContent>
        <SubdomainForm siteId={site.id} subdomain={site.subdomain} platformHost={platformHost} />
        <VersionHistory site={site} canManage={canManage} />
        <DomainList siteId={site.id} domains={site.domains} platformHost={platformHost} />
        <AddDomainForm siteId={site.id} baseHost={baseHost} />
      </CardContent>
    </Card>
  )
}

type PendingAction =
  | { type: "rollback"; revisionId: string; publicationNumber: string }
  | { type: "discard" }

function VersionHistory({ site, canManage }: { site: DashboardSite; canManage: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const hasPublished = site.publishedVersions.length > 0

  async function confirm() {
    if (!pending) return
    setBusy(true)
    const res =
      pending.type === "rollback"
        ? await rollbackSiteFn({ data: { siteId: site.id, targetRevisionId: pending.revisionId } })
        : await discardDraftFn({ data: { siteId: site.id } })
    setBusy(false)
    setPending(null)
    if (res.ok) await router.invalidate()
    else window.alert(pending.type === "rollback" ? "Rollback failed." : "Discard failed.")
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">Versions</h3>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Draft v{site.draftVersion} · edited {new Date(site.draftUpdatedAt).toLocaleString()}
        </span>
        {site.hasUnpublishedChanges ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            Unpublished changes
          </span>
        ) : hasPublished ? (
          <span className="text-xs text-muted-foreground">All changes published</span>
        ) : null}
        {canManage && hasPublished && site.hasUnpublishedChanges ? (
          <button
            type="button"
            onClick={() => setPending({ type: "discard" })}
            className="text-xs text-brand hover:underline"
          >
            Discard draft
          </button>
        ) : null}
      </div>
      {hasPublished ? (
        <ul className="mt-2 flex flex-col gap-1">
          {site.publishedVersions.map((v) => (
            <li key={v.revisionId} className="flex items-center gap-2 text-sm">
              <span className="font-medium">Publication {v.publicationNumber}</span>
              <span className="text-muted-foreground">
                {new Date(v.createdAt).toLocaleString()}
              </span>
              {v.isLive ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                  Live
                </span>
              ) : canManage ? (
                <button
                  type="button"
                  onClick={() =>
                    setPending({
                      type: "rollback",
                      revisionId: v.revisionId,
                      publicationNumber: v.publicationNumber,
                    })
                  }
                  className="text-xs text-brand hover:underline"
                >
                  Roll back
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Not published yet.</p>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.type === "rollback" ? "Roll back this publication?" : "Discard draft changes?"
        }
        description={
          pending?.type === "rollback"
            ? `This publishes publication ${pending.publicationNumber} again as a new revision and resets the draft to it.`
            : "This resets the draft to the current published version. Unpublished changes will be lost."
        }
        confirmLabel={pending?.type === "rollback" ? "Roll back" : "Discard"}
        busy={busy}
        onConfirm={confirm}
      />
    </div>
  )
}

function DomainList({
  siteId,
  domains,
  platformHost,
}: {
  siteId: string
  domains: DashboardSite["domains"]
  platformHost: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const custom = domains.filter((d) => !d.hostname.endsWith(`.${platformHost}`))

  async function confirm() {
    if (!pending) return
    setBusy(true)
    const res = await removeDomain({ data: { siteId, hostname: pending } })
    setBusy(false)
    setPending(null)
    if (res.ok) await router.invalidate()
    else window.alert("Could not remove that domain.")
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">Domains</h3>
      {domains.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No domains yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {domains.map((d) => (
            <li key={d.hostname} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{d.hostname}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {d.status}
              </span>
              {d.isPrimary ? <span className="text-xs text-brand">primary</span> : null}
              {custom.includes(d) ? (
                <button
                  type="button"
                  onClick={() => setPending(d.hostname)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Remove this domain?"
        description={
          <>
            <span className="font-medium">{pending}</span> will stop pointing to this site. You can
            add it again later.
          </>
        }
        confirmLabel="Remove"
        busy={busy}
        onConfirm={confirm}
      />
    </div>
  )
}

function SubdomainForm({
  siteId,
  subdomain,
  platformHost,
}: { siteId: string; subdomain: string; platformHost: string }) {
  const router = useRouter()
  const [value, setValue] = useState(subdomain)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await changeSubdomain({ data: { siteId, subdomain: value } })
    setBusy(false)
    if (res.ok) {
      await router.invalidate()
    } else if (res.code === "taken") {
      setError("That subdomain is already taken.")
    } else {
      setError(res.reason ?? "Invalid subdomain.")
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h3 className="text-sm font-semibold">Subdomain</h3>
      <div className="mt-1 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          className="w-48 rounded-[var(--radius-base)] border border-input px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <span className="text-sm text-muted-foreground">.{platformHost}</span>
        <Button type="submit" size="sm" disabled={busy || value === subdomain}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </form>
  )
}

function AddDomainForm({ siteId, baseHost }: { siteId: string; baseHost: string }) {
  const router = useRouter()
  const [hostname, setHostname] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addDomain({ data: { siteId, hostname } })
      setHostname("")
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add domain")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="www.yourbrand.com"
          className="flex-1 rounded-[var(--radius-base)] border border-input px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add domain"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        After adding, point a CNAME record at <span className="font-medium">{baseHost}</span> and
        we'll issue a certificate automatically.
      </p>
    </form>
  )
}
