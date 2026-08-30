import type { ListingFilter } from "@realtr/core"
import { Button } from "@realtr/ui/components/button"
import { Field, FieldDescription, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useEffect, useState } from "react"
import { previewCollectionFn } from "../server/collections"

export interface CollectionFormValues {
  name: string
  slug: string
  description: string
  status: "draft" | "published"
  rank: number | null
  filter: ListingFilter
}

export const emptyCollection: CollectionFormValues = {
  name: "",
  slug: "",
  description: "",
  status: "draft",
  rank: null,
  filter: { sort: "newest" },
}

const SELECT =
  "h-9 rounded-[var(--radius-base)] border border-input bg-transparent px-2 text-sm shadow-sm"

// A "N+" beds/baths select bound to a numeric filter key.
function MinSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (n: number | undefined) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <select
        className={SELECT}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">Any</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}+
          </option>
        ))}
      </select>
    </Field>
  )
}

function numberOrUndef(value: string): number | undefined {
  const n = Number(value)
  return value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

function firstOrEmpty(values: string[] | undefined): string {
  return values?.[0] ?? ""
}

function oneOrNone(value: string): string[] | undefined {
  const v = value.trim()
  return v ? [v] : undefined
}

export function CollectionForm({
  initial,
  saving,
  onSave,
  onDelete,
}: {
  initial: CollectionFormValues
  saving: boolean
  onSave: (values: CollectionFormValues, status: "draft" | "published") => void
  onDelete?: () => void
}) {
  const [v, setV] = useState<CollectionFormValues>(initial)
  const [preview, setPreview] = useState<number | null>(null)
  const set = (patch: Partial<CollectionFormValues>) => setV((prev) => ({ ...prev, ...patch }))
  const setFilter = (patch: Partial<ListingFilter>) =>
    setV((prev) => ({ ...prev, filter: { ...prev.filter, ...patch } }))

  // Live "how many listings match" — debounced so typing doesn't spam the server. v.filter is a fresh
  // object only when the filter actually changes (setFilter), so it is the right dependency.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await previewCollectionFn({ data: v.filter })
      if (!cancelled && res.ok) setPreview(res.count)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [v.filter])

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(v, v.status)
      }}
    >
      <Field>
        <FieldLabel htmlFor="c-name">Name</FieldLabel>
        <Input
          id="c-name"
          value={v.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-invalid={v.name.trim() === "" || undefined}
          placeholder="Luxury homes for sale"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="c-slug">URL slug</FieldLabel>
        <Input
          id="c-slug"
          value={v.slug}
          onChange={(e) => set({ slug: e.target.value })}
          placeholder="luxury-homes"
          className="font-mono"
        />
        <FieldDescription>
          Leave blank to generate one from the name. Lives at /collections/&lt;slug&gt;.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="c-desc">Description</FieldLabel>
        <Input
          id="c-desc"
          value={v.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Shown on the collection page and popular-searches cards."
        />
      </Field>

      <fieldset className="rounded-[var(--radius-base)] border border-border p-4">
        <legend className="px-1 text-sm font-medium">Saved search</legend>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="c-min-price">Min price</FieldLabel>
            <Input
              id="c-min-price"
              type="number"
              min={0}
              step={25000}
              value={v.filter.minPrice ?? ""}
              onChange={(e) => setFilter({ minPrice: numberOrUndef(e.target.value) })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-max-price">Max price</FieldLabel>
            <Input
              id="c-max-price"
              type="number"
              min={0}
              step={25000}
              value={v.filter.maxPrice ?? ""}
              onChange={(e) => setFilter({ maxPrice: numberOrUndef(e.target.value) })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-sort">Sort</FieldLabel>
            <select
              id="c-sort"
              className={SELECT}
              value={v.filter.sort ?? "newest"}
              onChange={(e) => setFilter({ sort: e.target.value as ListingFilter["sort"] })}
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
            </select>
          </Field>
          <MinSelect
            label="Beds"
            value={v.filter.minBeds}
            onChange={(n) => setFilter({ minBeds: n })}
          />
          <MinSelect
            label="Baths"
            value={v.filter.minBaths}
            onChange={(n) => setFilter({ minBaths: n })}
          />
          <Field>
            <FieldLabel htmlFor="c-type">Property type</FieldLabel>
            <Input
              id="c-type"
              value={firstOrEmpty(v.filter.propertyType)}
              onChange={(e) => setFilter({ propertyType: oneOrNone(e.target.value) })}
              placeholder="House"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-city">City</FieldLabel>
            <Input
              id="c-city"
              value={firstOrEmpty(v.filter.city)}
              onChange={(e) => setFilter({ city: oneOrNone(e.target.value) })}
              placeholder="Ottawa"
            />
          </Field>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {preview === null
            ? "Calculating matches…"
            : `${preview} listing${preview === 1 ? "" : "s"} match this search right now.`}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving || v.name.trim() === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {v.status === "published" ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onSave({ ...v, status: "draft" }, "draft")}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={saving || v.name.trim() === ""}
              onClick={() => onSave({ ...v, status: "published" }, "published")}
            >
              Publish
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {v.status === "published" ? "Published" : "Draft"}
          </span>
        </div>
        {onDelete ? (
          <Button type="button" variant="destructive" disabled={saving} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}
