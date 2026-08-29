import { Button, Card, CardContent, CardHeader, CardTitle } from "@realtr/ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { type FormEvent, type ReactNode, useState } from "react"
import { toast } from "sonner"
import { LocalTime } from "../components/local-time"
import { getDomainSetupFn, verifyDomainFn } from "../server/domains"
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

export const Route = createFileRoute("/_dashboard/")({
  loader: async () => {
    const data = await getDashboard()
    if (!data) throw redirect({ to: "/login" })
    return data
  },
  component: Dashboard,
})

function Dashboard() {
  const { baseHost, platformHost, canManage, sites } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Your sites</h1>

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
      <Toaster />
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
  | { type: "restore"; revisionId: string; publicationNumber: string }
  | { type: "discard" }

function VersionHistory({ site, canManage }: { site: DashboardSite; canManage: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const hasPublished = site.publishedVersions.length > 0

  async function confirm() {
    if (!pending) return
    const action = pending.type
    setBusy(true)
    const res =
      pending.type === "restore"
        ? await rollbackSiteFn({ data: { siteId: site.id, targetRevisionId: pending.revisionId } })
        : await discardDraftFn({ data: { siteId: site.id } })
    setBusy(false)
    setPending(null)
    if (res.ok) {
      await router.invalidate()
      toast.success(
        action === "restore"
          ? "Version restored as a new publication."
          : "Draft changes discarded.",
      )
    } else {
      toast.error(action === "restore" ? "Restore failed." : "Discard failed.")
    }
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">Versions</h3>
      {site.hasUnpublishedChanges || !hasPublished ? (
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Draft · edited <LocalTime iso={site.draftUpdatedAt} />
          </span>
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {site.draftHash}
          </code>
          {site.hasUnpublishedChanges ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              Unpublished changes
            </span>
          ) : null}
          {canManage && site.hasUnpublishedChanges ? (
            <button
              type="button"
              onClick={() => setPending({ type: "discard" })}
              className="text-xs text-brand hover:underline"
            >
              Discard draft
            </button>
          ) : null}
        </div>
      ) : null}
      {hasPublished ? (
        <ul className="mt-2 flex flex-col gap-1">
          {site.publishedVersions.map((v) => (
            <li key={v.revisionId} className="flex items-center gap-2 text-sm">
              <span className="font-medium">Version {v.publicationNumber}</span>
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {v.hash}
              </code>
              <span className="text-muted-foreground">
                <LocalTime iso={v.createdAt} />
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
                      type: "restore",
                      revisionId: v.revisionId,
                      publicationNumber: v.publicationNumber,
                    })
                  }
                  className="text-xs text-brand hover:underline"
                >
                  Restore
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
        title={pending?.type === "restore" ? "Restore this version?" : "Discard draft changes?"}
        description={
          pending?.type === "restore"
            ? `Version ${pending.publicationNumber} will be published again as the newest version, and your draft will be replaced with it.`
            : "This resets the draft to the current published version. Unpublished changes will be lost."
        }
        confirmLabel={pending?.type === "restore" ? "Restore" : "Discard"}
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
        <ul className="mt-2 flex flex-col gap-2">
          {domains.map((d) => (
            <DomainRow
              key={d.hostname}
              siteId={siteId}
              domain={d}
              isCustom={custom.includes(d)}
              onRemove={() => setPending(d.hostname)}
            />
          ))}
        </ul>
      )}
      {custom.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          A custom domain isn't served until it's verified. Add the DNS records shown under “DNS
          setup”, then click Verify.
        </p>
      ) : null}
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

function DomainRow({
  siteId,
  domain,
  isCustom,
  onRemove,
}: {
  siteId: string
  domain: DashboardSite["domains"][number]
  isCustom: boolean
  onRemove: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<"verify" | "setup" | null>(null)
  const [instructions, setInstructions] = useState<Array<{
    type: string
    name: string
    value: string
  }> | null>(null)

  async function verify() {
    setBusy("verify")
    const res = await verifyDomainFn({ data: { siteId, hostname: domain.hostname } })
    setBusy(null)
    if (!res.ok) {
      toast.error(res.code === "forbidden" ? "You can't manage domains." : "Could not verify.")
      return
    }
    if (res.verified) {
      toast.success(`${domain.hostname} verified — it'll be served shortly.`)
      await router.invalidate()
    } else {
      toast.error(res.reason ?? "Not verified yet. Check the DNS records.")
    }
  }

  async function toggleSetup() {
    if (instructions) {
      setInstructions(null)
      return
    }
    setBusy("setup")
    const res = await getDomainSetupFn({ data: { siteId, hostname: domain.hostname } })
    setBusy(null)
    if (res.ok) setInstructions(res.instructions)
    else toast.error("Could not load DNS setup.")
  }

  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{domain.hostname}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {domain.status}
        </span>
        {domain.isPrimary ? <span className="text-xs text-brand">primary</span> : null}
        {isCustom ? (
          <>
            {domain.status !== "active" ? (
              <button
                type="button"
                onClick={() => void verify()}
                disabled={busy !== null}
                className="text-xs text-brand hover:underline"
              >
                {busy === "verify" ? "Verifying…" : "Verify"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void toggleSetup()}
              disabled={busy !== null}
              className="text-xs text-muted-foreground hover:underline"
            >
              {instructions ? "Hide DNS setup" : "DNS setup"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
      {instructions ? (
        <div className="ml-1 flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2 font-mono text-xs">
          {instructions.map((record) => (
            <div key={`${record.type}-${record.name}`} className="flex flex-wrap gap-x-2">
              <span className="font-semibold">{record.type}</span>
              <span className="text-muted-foreground">{record.name}</span>
              <span>→</span>
              <span>{record.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </li>
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
