import { Button } from "@realtr/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@realtr/ui/components/card"
import { Field, FieldDescription, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  connectListingSourceFn,
  disconnectListingSourceFn,
  getListingStatusFn,
  syncListingSourceFn,
  testListingSourceFn,
} from "../server/listings"
import { LocalTime } from "./local-time"

interface ListingStatus {
  canManage: boolean
  isSuperAdmin: boolean
  status: string
  activeListings: number
  lastReconciledAt: string | null
  lastSync: {
    status: string
    mode: string
    upserted: number
    removed: number
    error: string | null
    finishedAt: string | null
  } | null
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "connected"
      ? "bg-success/15 text-success"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-secondary text-muted-foreground"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{status}</span>
}

export function ListingsCard() {
  const [status, setStatus] = useState<ListingStatus | null>(null)
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState<
    "connect" | "test" | "disconnect" | "incremental" | "reconcile" | null
  >(null)

  const load = useCallback(async () => {
    const res = await getListingStatusFn()
    if (res.ok) setStatus(res)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const connected = status?.status === "connected"

  const test = async () => {
    setBusy("test")
    const res = await testListingSourceFn({ data: { clientId, clientSecret } })
    setBusy(null)
    if (res.ok) toast.success("Credentials look good.")
    else if (res.code === "verify_failed") toast.error(`Test failed: ${res.message}`)
    else toast.error("Could not test the connection.")
  }

  const connect = async () => {
    setBusy("connect")
    const res = await connectListingSourceFn({ data: { clientId, clientSecret } })
    setBusy(null)
    if (res.ok) {
      setClientId("")
      setClientSecret("")
      setShowForm(false)
      toast.success("DDF connected. Your listings will sync shortly.")
      await load()
    } else if (res.code === "verify_failed") {
      toast.error(`Connection failed: ${res.message}`)
    } else if (res.code === "forbidden") {
      toast.error("You do not have permission to manage integrations.")
    } else {
      toast.error("Could not connect.")
    }
  }

  const sync = async (mode: "incremental" | "reconcile") => {
    setBusy(mode)
    const res = await syncListingSourceFn({ data: { mode } })
    setBusy(null)
    if (res.ok) {
      toast.success(`Synced — +${res.upserted} / -${res.removed}.`)
      await load()
    } else if (res.code === "not_connected") {
      toast.error("Connect DDF first.")
    } else if (res.code === "sync_failed") {
      toast.error(`Sync failed: ${res.message ?? "unknown error"}`)
    } else {
      toast.error("Could not sync.")
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    const res = await disconnectListingSourceFn()
    setBusy(null)
    if (res.ok) {
      toast.success("DDF disconnected. Listings are no longer shown.")
      await load()
    } else {
      toast.error("Could not disconnect.")
    }
  }

  const canManage = status?.canManage ?? false
  const formOpen = showForm || (!connected && status !== null)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>REALTOR.ca listings (DDF)</CardTitle>
          {status ? <StatusBadge status={status.status} /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status ? (
          <div className="text-sm text-muted-foreground">
            {connected ? (
              <>
                <span className="text-foreground">{status.activeListings}</span> active listings
                {status.lastSync?.finishedAt ? (
                  <>
                    {" · "}last {status.lastSync.mode} sync{" "}
                    <LocalTime iso={status.lastSync.finishedAt} />
                    {status.lastSync.status === "failed" ? (
                      <span className="text-destructive">
                        {" "}
                        — failed{status.lastSync.error ? `: ${status.lastSync.error}` : ""}
                      </span>
                    ) : (
                      ` (+${status.lastSync.upserted} / -${status.lastSync.removed})`
                    )}
                  </>
                ) : (
                  " · waiting for first sync"
                )}
              </>
            ) : (
              "Connect your DDF Web API key to display your REALTOR.ca listings on your site."
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {canManage && formOpen ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Field>
              <FieldLabel htmlFor="ddf-client-id">API key (Client ID)</FieldLabel>
              <Input
                id="ddf-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ddf-client-secret">API secret (Client Secret)</FieldLabel>
              <Input
                id="ddf-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="off"
              />
              <FieldDescription>
                Generate these in the CREA Member Portal (DDF Dashboard). They're stored encrypted.
              </FieldDescription>
            </Field>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void connect()}
                disabled={busy !== null || clientId === "" || clientSecret === ""}
              >
                {busy === "connect" ? "Connecting…" : "Connect"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void test()}
                disabled={busy !== null || clientId === "" || clientSecret === ""}
              >
                {busy === "test" ? "Testing…" : "Test"}
              </Button>
              {connected ? (
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {canManage && connected && !showForm ? (
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
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              Update key
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void disconnect()}
              disabled={busy !== null}
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : null}

        {status?.isSuperAdmin ? (
          <a href="/admin" className="text-sm text-brand hover:underline">
            Open admin console →
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}
