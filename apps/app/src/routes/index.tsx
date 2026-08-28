import { Button, Card, CardContent, CardHeader, CardTitle } from "@realtr/ui"
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { authClient } from "../lib/auth-client"
import { type DashboardSite, addDomain, getDashboard } from "../server/tenant"

export const Route = createFileRoute("/")({
  loader: async () => {
    const data = await getDashboard()
    if (!data) throw redirect({ to: "/login" })
    return data
  },
  component: Dashboard,
})

function Dashboard() {
  const { orgName, baseHost, sites } = Route.useLoaderData()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{orgName}</p>
          <h1 className="font-heading text-3xl font-bold">Your sites</h1>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} baseHost={baseHost} />
        ))}
      </div>
    </main>
  )
}

function SiteCard({ site, baseHost }: { site: DashboardSite; baseHost: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{site.name}</CardTitle>
          <span className="rounded-full bg-muted/15 px-3 py-1 text-xs text-muted">
            template: {site.templateId}
          </span>
        </div>
        <a href={site.previewUrl} className="text-sm text-brand" target="_blank" rel="noreferrer">
          {site.previewUrl} ↗
        </a>
        <Link to="/sites/$siteId/edit" params={{ siteId: site.id }} className="mt-2 inline-block">
          <Button size="sm">Edit site</Button>
        </Link>
      </CardHeader>
      <CardContent>
        <h3 className="text-sm font-semibold">Domains</h3>
        {site.domains.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No domains yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {site.domains.map((d) => (
              <li key={d.hostname} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{d.hostname}</span>
                <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">
                  {d.status}
                </span>
                {d.isPrimary ? <span className="text-xs text-brand">primary</span> : null}
              </li>
            ))}
          </ul>
        )}
        <AddDomainForm siteId={site.id} baseHost={baseHost} />
      </CardContent>
    </Card>
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
          className="flex-1 rounded-[var(--radius-base)] border border-muted/30 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add domain"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-muted">
        After adding, point a CNAME record at <span className="font-medium">{baseHost}</span> and
        we'll issue a certificate automatically.
      </p>
    </form>
  )
}
