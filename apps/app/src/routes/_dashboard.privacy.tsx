import { Button } from "@realtr/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@realtr/ui/components/card"
import { Input } from "@realtr/ui/components/input"
import { Toaster } from "@realtr/ui/components/sonner"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { deleteMyOrgFn, exportMyOrgDataFn } from "../server/privacy"

export const Route = createFileRoute("/_dashboard/privacy")({
  component: PrivacyPage,
})

function PrivacyPage() {
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [deleting, setDeleting] = useState(false)

  const exportData = async () => {
    setExporting(true)
    const res = await exportMyOrgDataFn()
    setExporting(false)
    if (!res.ok) {
      toast.error(
        res.code === "forbidden" ? "Only the owner can export data." : "Could not export.",
      )
      return
    }
    // Client-side download of the JSON export.
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `realtr-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Your data export has been downloaded.")
  }

  const deleteOrg = async () => {
    setDeleting(true)
    const res = await deleteMyOrgFn({ data: { confirmName } })
    setDeleting(false)
    if (res.ok) {
      toast.success("Your organization and all its data have been deleted.")
      await router.navigate({ to: "/login" })
      return
    }
    if (res.code === "name_mismatch") toast.error("The name you typed doesn't match.")
    else if (res.code === "forbidden") toast.error("Only the owner can delete the organization.")
    else toast.error("Could not delete the organization.")
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Data & privacy</h1>
      <p className="mt-2 text-muted-foreground">
        Export everything Realtr holds for your organization, or permanently delete it.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Export your data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Download a JSON file with your organization, members, site content, listings, leads,
              domains, and subscription. Third-party credentials are redacted.
            </p>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={exporting}
              onClick={() => void exportData()}
            >
              {exporting ? "Preparing…" : "Download my data"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Delete organization</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              This permanently deletes your organization and all its data — sites, listings, leads,
              members, and domains. This cannot be undone. Cancel any active subscription in Billing
              first. Type your organization's exact name to confirm.
            </p>
            <Input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder="Organization name"
              aria-label="Confirm organization name"
              className="max-w-sm"
            />
            <Button
              type="button"
              variant="destructive"
              className="self-start"
              disabled={deleting || confirmName.trim() === ""}
              onClick={() => void deleteOrg()}
            >
              {deleting ? "Deleting…" : "Delete organization permanently"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </main>
  )
}
