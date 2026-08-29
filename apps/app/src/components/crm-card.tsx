import { Button } from "@realtr/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@realtr/ui/components/card"
import { Field, FieldDescription, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { connectCrmFn, disconnectCrmFn, getCrmStatusFn, testCrmFn } from "../server/crm"

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "connected"
      ? "bg-success/15 text-success"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-secondary text-muted-foreground"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{status}</span>
}

export function CrmCard() {
  const [state, setState] = useState<{ status: string; canManage: boolean } | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState<"connect" | "test" | "disconnect" | null>(null)

  const load = useCallback(async () => {
    const res = await getCrmStatusFn()
    if (res.ok) setState({ status: res.status, canManage: res.canManage })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const connected = state?.status === "connected"
  const canManage = state?.canManage ?? false
  const formOpen = showForm || (!connected && state !== null)

  const test = async () => {
    setBusy("test")
    const res = await testCrmFn({ data: { apiKey } })
    setBusy(null)
    if (res.ok) toast.success("Follow Up Boss key looks good.")
    else if (res.code === "verify_failed") toast.error(`Test failed: ${res.message}`)
    else toast.error("Could not test the connection.")
  }

  const connect = async () => {
    setBusy("connect")
    const res = await connectCrmFn({ data: { apiKey } })
    setBusy(null)
    if (res.ok) {
      setApiKey("")
      setShowForm(false)
      toast.success("Follow Up Boss connected. New leads will be delivered automatically.")
      await load()
    } else if (res.code === "verify_failed") {
      toast.error(`Connection failed: ${res.message}`)
    } else if (res.code === "forbidden") {
      toast.error("You do not have permission to manage integrations.")
    } else {
      toast.error("Could not connect.")
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    const res = await disconnectCrmFn()
    setBusy(null)
    if (res.ok) {
      toast.success("Follow Up Boss disconnected.")
      await load()
    } else {
      toast.error("Could not disconnect.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Follow Up Boss (CRM)</CardTitle>
          {state ? <StatusBadge status={state.status} /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state ? (
          <p className="text-sm text-muted-foreground">
            {connected
              ? "New leads from your site are delivered to Follow Up Boss automatically."
              : "Connect your Follow Up Boss API key to deliver new leads to your CRM."}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {canManage && formOpen ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Field>
              <FieldLabel htmlFor="fub-api-key">API key</FieldLabel>
              <Input
                id="fub-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
              />
              <FieldDescription>Follow Up Boss → Admin → API. Stored encrypted.</FieldDescription>
            </Field>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void connect()}
                disabled={busy !== null || apiKey === ""}
              >
                {busy === "connect" ? "Connecting…" : "Connect"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void test()}
                disabled={busy !== null || apiKey === ""}
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
      </CardContent>
    </Card>
  )
}
