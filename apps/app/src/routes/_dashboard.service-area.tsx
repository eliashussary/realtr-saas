import { Button } from "@realtr/ui/components/button"
import { Field, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { type Bbox, ServiceAreaMap } from "../components/service-area-map"
import {
  clearServiceAreaFn,
  getServiceAreaFn,
  previewServiceAreaFn,
  saveServiceAreaFn,
} from "../server/service-area"

export const Route = createFileRoute("/_dashboard/service-area")({
  loader: () => getServiceAreaFn(),
  component: ServiceAreaPage,
})

function round(n: number): number {
  return Math.round(n * 1e5) / 1e5
}

function ServiceAreaPage() {
  const router = useRouter()
  const data = Route.useLoaderData()
  const initial = data.ok && data.area ? data.area : null
  const [bbox, setBbox] = useState<Bbox | null>(
    initial
      ? {
          minLng: initial.minLng,
          minLat: initial.minLat,
          maxLng: initial.maxLng,
          maxLat: initial.maxLat,
        }
      : null,
  )
  const [label, setLabel] = useState(initial?.label ?? "")
  const [count, setCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Live "how many listings would show" for the candidate box, debounced. bbox is a fresh object only
  // when it actually changes (capture/clear), so it is the right dependency.
  useEffect(() => {
    if (!bbox) {
      setCount(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await previewServiceAreaFn({ data: { ...bbox, label } })
      if (!cancelled && res.ok) setCount(res.count)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [bbox, label])

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and admins can set the service area.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  const save = async () => {
    if (!bbox) return
    setSaving(true)
    const res = await saveServiceAreaFn({ data: { ...bbox, label } })
    setSaving(false)
    if (res.ok) {
      toast.success("Service area saved.")
      await router.invalidate()
    } else {
      toast.error("Could not save the service area.")
    }
  }

  const clear = async () => {
    if (!window.confirm("Remove the service area? Your site will show all listings again.")) return
    setSaving(true)
    const res = await clearServiceAreaFn()
    setSaving(false)
    if (res.ok) {
      setBbox(null)
      setLabel("")
      toast.success("Service area removed.")
      await router.invalidate()
    } else {
      toast.error("Could not remove the service area.")
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Service area</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Define the market you serve. Your site pulls and shows only feed listings inside this area
        (your own manually-added listings always show). Leave it unset to show everything.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <ServiceAreaMap bbox={bbox} onCapture={setBbox} />

        <Field>
          <FieldLabel htmlFor="sa-label">Label (optional)</FieldLabel>
          <Input
            id="sa-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ottawa & west suburbs"
          />
        </Field>

        {bbox ? (
          <div className="rounded-[var(--radius-base)] border border-border p-4 text-sm">
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-4">
              <span>
                SW {round(bbox.minLat)}, {round(bbox.minLng)}
              </span>
              <span>
                NE {round(bbox.maxLat)}, {round(bbox.maxLng)}
              </span>
            </div>
            <p className="mt-3 text-muted-foreground">
              {count === null
                ? "Counting listings…"
                : `${count} listing${count === 1 ? "" : "s"} would show in this area.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No service area set — the site shows all listings.
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button type="button" onClick={() => void save()} disabled={saving || !bbox}>
            {saving ? "Saving…" : "Save service area"}
          </Button>
          {initial ? (
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void clear()}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <Toaster />
    </main>
  )
}
