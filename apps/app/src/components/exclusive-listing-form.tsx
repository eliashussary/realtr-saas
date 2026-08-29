import { Button } from "@realtr/ui/components/button"
import { Field, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import {
  type ExclusiveListingForm as FormValues,
  createExclusiveListingFn,
  updateExclusiveListingFn,
} from "../server/listings"
import { ImageUpload } from "./image-upload"

const EMPTY: FormValues = {
  address: "",
  city: "",
  province: "",
  price: null,
  bedrooms: null,
  bathrooms: null,
  livingArea: null,
  propertyType: "",
  description: "",
  photos: [],
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function ExclusiveListingForm({
  mode,
  listingId,
  initial,
}: {
  mode: "create" | "edit"
  listingId?: string
  initial?: FormValues
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormValues>(initial ?? EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Numeric fields are edited as strings so the input can be cleared; parsed on change into the form.
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.address.trim()) {
      setError("Address is required.")
      return
    }
    setBusy(true)
    setError(null)
    const res =
      mode === "create"
        ? await createExclusiveListingFn({ data: form })
        : await updateExclusiveListingFn({ data: { ...form, listingId: listingId ?? "" } })
    setBusy(false)
    if (res.ok) {
      toast.success(mode === "create" ? "Exclusive listing created." : "Listing updated.")
      router.navigate({ to: "/listings" })
    } else {
      setError(
        res.code === "forbidden" ? "You don't have permission." : "Could not save the listing.",
      )
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-2xl flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="excl-address">Address</FieldLabel>
        <Input
          id="excl-address"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="123 Main Street"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="excl-city">City</FieldLabel>
          <Input id="excl-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="excl-province">Province</FieldLabel>
          <Input
            id="excl-province"
            value={form.province}
            onChange={(e) => set("province", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="excl-price">Price (CAD)</FieldLabel>
          <Input
            id="excl-price"
            inputMode="numeric"
            value={form.price ?? ""}
            onChange={(e) => set("price", numOrNull(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="excl-beds">Beds</FieldLabel>
          <Input
            id="excl-beds"
            inputMode="numeric"
            value={form.bedrooms ?? ""}
            onChange={(e) => set("bedrooms", numOrNull(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="excl-baths">Baths</FieldLabel>
          <Input
            id="excl-baths"
            inputMode="numeric"
            value={form.bathrooms ?? ""}
            onChange={(e) => set("bathrooms", numOrNull(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="excl-area">Area (sqft)</FieldLabel>
          <Input
            id="excl-area"
            inputMode="numeric"
            value={form.livingArea ?? ""}
            onChange={(e) => set("livingArea", numOrNull(e.target.value))}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="excl-type">Property type</FieldLabel>
        <Input
          id="excl-type"
          value={form.propertyType}
          onChange={(e) => set("propertyType", e.target.value)}
          placeholder="House, Condo, Townhouse…"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="excl-description">Description</FieldLabel>
        <textarea
          id="excl-description"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={5}
          className="rounded-[var(--radius-base)] border border-input px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </Field>

      <Field>
        <FieldLabel>Photos</FieldLabel>
        <ImageUpload value={form.photos} onChange={(photos) => set("photos", photos)} />
      </Field>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create listing" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.navigate({ to: "/listings" })}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
