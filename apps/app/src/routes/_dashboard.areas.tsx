import { Button } from "@realtr/ui/components/button"
import { Input } from "@realtr/ui/components/input"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { useCallback } from "react"
import { toast } from "sonner"
import { AreaMap } from "../components/area-map"
import { getAreaPolygonsFn, getAreasFn, saveAreasFn } from "../server/areas"

export const Route = createFileRoute("/_dashboard/areas")({
  loader: () => getAreasFn(),
  component: AreasPage,
})

type AreaItem = {
  id: string
  name: string
  region: string | null
  parentRegion: string | null
  count: number
  curated: boolean
  rank: number | null
}

function startCase(s: string) {
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ")
}

function AreasPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [order, setOrder] = useState<AreaItem[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState("")
  const inited = useRef(false)

  const fetchPolygons = useCallback(async (ids: string[]) => {
    const res = await getAreaPolygonsFn({ data: { areaIds: ids } })
    return res.ok ? res.polygons : []
  }, [])

  const items = data.ok ? data.items : []
  const hasServiceArea = data.ok ? data.hasServiceArea : false

  // On load: selected = curated items, in their curation order.
  useEffect(() => {
    if (!inited.current && data.ok) {
      inited.current = true
      const curated = items.filter((i) => i.curated)
      setSelected(new Set(curated.map((i) => i.id)))
      setOrder(curated)
    }
  }, [data.ok, items])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setOrder((o) => o.filter((i) => i.id !== id))
      } else {
        next.add(id)
        const item = items.find((i) => i.id === id)
        if (item) setOrder((o) => [...o, item])
      }
      setDirty(true)
      return next
    })
  }

  const move = (id: string, dir: -1 | 1) => {
    setOrder((o) => {
      const idx = o.findIndex((i) => i.id === id)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= o.length) return o
      const copy = [...o]
      ;[copy[idx], copy[to]] = [copy[to]!, copy[idx]!]
      return copy
    })
    setDirty(true)
  }

  // Select/deselect every area in a group at once. Newly-selected areas are appended to the order
  // in their group-display order (curated-first already), so the realtor can still reorder after.
  const setGroup = (groupItems: AreaItem[], select: boolean) => {
    const ids = groupItems.map((i) => i.id)
    setSelected((prev) => {
      const next = new Set(prev)
      if (select) for (const id of ids) next.add(id)
      else for (const id of ids) next.delete(id)
      return next
    })
    setOrder((o) => {
      if (select) {
        const existing = new Set(o.map((i) => i.id))
        const add = groupItems.filter((i) => !existing.has(i.id))
        return add.length ? [...o, ...add] : o
      }
      const drop = new Set(ids)
      return o.filter((i) => !drop.has(i.id))
    })
    setDirty(true)
  }

  // Search: filter the candidate list by neighbourhood name/region (case-insensitive substring).
  // Display-only — it never changes what's selected; a filtered-out area stays curated.
  const q = query.trim().toLowerCase()

  const allSelected = (groupItems: AreaItem[]) =>
    groupItems.length > 0 && groupItems.every((i) => selected.has(i.id))

  const grouped = useMemo(() => {
    const groups = new Map<string, AreaItem[]>()
    for (const it of items) {
      const key = it.parentRegion ?? "ottawa"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(it)
    }
    // Within a group: curated first (by rank), then by count.
    for (const arr of groups.values()) {
      arr.sort((a, b) => {
        if (a.curated !== b.curated) return a.curated ? -1 : 1
        if (a.curated && b.curated) return (a.rank ?? 0) - (b.rank ?? 0)
        return b.count - a.count || a.name.localeCompare(b.name)
      })
    }
    return groups
  }, [items])

  // Groups after the search filter is applied (display only). A group is hidden when no area in it
  // matches the search.
  const visibleGroups = useMemo(() => {
    const matches = (it: AreaItem) =>
      !q ||
      it.name.toLowerCase().includes(q) ||
      (it.region ? it.region.toLowerCase().includes(q) : false)
    const out: Array<[string, AreaItem[]]> = []
    for (const [key, all] of grouped.entries()) {
      const filtered = all.filter(matches)
      if (filtered.length > 0) out.push([key, filtered])
    }
    return out
  }, [grouped, q])

  const save = async () => {
    if (!data.ok) return
    setSaving(true)
    const res = await saveAreasFn({ data: { areaIds: order.map((i) => i.id) } })
    setSaving(false)
    if (res.ok) {
      setDirty(false)
      toast.success("Areas saved.")
      // Re-run the loader to refresh counts/ranks.
      await router.invalidate()
    } else {
      toast.error("Could not save areas.")
    }
  }

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please sign in to manage areas.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden px-6 py-8">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-bold">Areas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick the neighbourhoods in your service area that your site&rsquo;s area filter offers,
            and their order. Areas you don&rsquo;t pick still appear in search if a listing is there
            — this only shapes the filter menu.
          </p>
        </div>
        {items.length > 0 ? (
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save areas"}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        hasServiceArea ? (
          <div className="mt-10 rounded-[var(--radius-base)] border border-dashed border-border p-10 text-center">
            <p className="font-medium">No areas in your service area yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust your service area to include more neighbourhoods, and they&rsquo;ll appear here
              for curation.
            </p>
            <Link
              to="/service-area"
              className="mt-4 inline-block text-sm text-brand hover:underline"
            >
              Set your service area →
            </Link>
          </div>
        ) : (
          <div className="mt-10 rounded-[var(--radius-base)] border border-dashed border-border p-10 text-center">
            <p className="font-medium">No service area set</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set your service area to curate the neighbourhoods you serve.
            </p>
            <Link
              to="/service-area"
              className="mt-4 inline-block text-sm text-brand hover:underline"
            >
              Set your service area →
            </Link>
          </div>
        )
      ) : (
        <>
          {/* Search row — above the split, always in view. */}
          <div className="mt-5 flex shrink-0 items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search neighbourhoods…"
              className="max-w-sm"
            />
            {query.trim() ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {visibleGroups.reduce((n, [, g]) => n + g.length, 0)} of {items.length} areas
              </span>
            ) : null}
          </div>
          {/* Split view: scrollable list (left) + fixed map (right), filling the remaining height. */}
          <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,720px)]">
            <div className="-mr-4 flex min-h-0 flex-col gap-5 overflow-y-auto pr-4">
              {visibleGroups.length === 0 ? (
                <div className="rounded-[var(--radius-base)] border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">No areas match “{query.trim()}”.</p>
                </div>
              ) : null}
              {visibleGroups.map(([regionKey, groupItems]) => (
                <section
                  key={regionKey}
                  className="rounded-[var(--radius-base)] border border-border p-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading text-lg font-semibold">
                      {regionKey === "ottawa" ? "Ottawa" : startCase(regionKey)}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setGroup(groupItems, !allSelected(groupItems))}
                      className="text-xs text-brand hover:underline"
                    >
                      {allSelected(groupItems) ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {groupItems.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-secondary/40"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggle(it.id)}
                          aria-label={it.name}
                        />
                        <span className="flex-1 text-sm">
                          {it.name}
                          {it.region ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {startCase(it.region)}
                            </span>
                          ) : null}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {it.count}
                        </span>
                        {it.curated ? (
                          <span className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => move(it.id, -1)}
                              disabled={!dirty}
                              className="rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                              aria-label={`Move ${it.name} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(it.id, 1)}
                              disabled={!dirty}
                              className="rounded px-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                              aria-label={`Move ${it.name} down`}
                            >
                              ↓
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="hidden min-h-0 lg:block">
              <AreaMap areas={order} fetchPolygons={fetchPolygons} />
            </div>
          </div>
        </>
      )}
      <Toaster />
    </main>
  )
}
