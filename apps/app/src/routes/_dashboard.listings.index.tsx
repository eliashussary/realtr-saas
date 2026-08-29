import { Button } from "@realtr/ui/components/button"
import { Input } from "@realtr/ui/components/input"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { Pencil, Plus, Star, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  type ListingListItem,
  deleteExclusiveListingFn,
  listListingsFn,
  setListingFeaturedFn,
} from "../server/listings"

export const Route = createFileRoute("/_dashboard/listings/")({
  loader: () => listListingsFn(),
  component: ListingsPage,
})

function SourceBadge({ source }: { source: string }) {
  const label = source === "ddf" ? "REALTOR.ca" : source === "manual" ? "Exclusive" : source
  const tone = source === "manual" ? "bg-brand/10 text-brand" : "bg-secondary text-muted-foreground"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

function ListingsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [showRemoved, setShowRemoved] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const items = data.ok ? data.items : []
  const canFeature = data.ok ? data.canFeature : false
  const canCreate = data.ok ? data.canCreate : false
  const canManageAny = data.ok ? data.canManageAny : false
  const canManageOwn = data.ok ? data.canManageOwn : false
  const myMemberId = data.ok ? data.memberId : null
  // The actions column appears if the viewer can act on at least some rows.
  const showActions = canFeature || canManageAny || canManageOwn

  // May this viewer edit/delete a given exclusive row? Admins any; agents only their own.
  const canEditRow = (it: ListingListItem) =>
    it.source === "manual" && (canManageAny || (canManageOwn && it.memberId === myMemberId))

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((it) => {
      if (!showRemoved && it.status !== "active") return false
      if (!term) return true
      return (
        (it.address ?? "").toLowerCase().includes(term) ||
        (it.cityProvince ?? "").toLowerCase().includes(term)
      )
    })
  }, [items, search, showRemoved])

  async function toggleFeatured(it: ListingListItem) {
    setBusyId(it.id)
    const res = await setListingFeaturedFn({ data: { listingId: it.id, featured: !it.featured } })
    setBusyId(null)
    if (res.ok) {
      await router.invalidate()
      toast.success(it.featured ? "Removed from featured." : "Added to featured.")
    } else {
      toast.error("Could not update featured.")
    }
  }

  async function deleteListing(it: ListingListItem) {
    if (!window.confirm(`Delete "${it.address ?? "this listing"}"? This can't be undone.`)) return
    setBusyId(it.id)
    const res = await deleteExclusiveListingFn({ data: { listingId: it.id } })
    setBusyId(null)
    if (res.ok) {
      await router.invalidate()
      toast.success("Exclusive listing deleted.")
    } else {
      toast.error("Could not delete the listing.")
    }
  }

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please sign in to view listings.</p>
      </main>
    )
  }

  const featuredCount = items.filter((it) => it.featured && it.status === "active").length

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Listings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Synced from REALTOR.ca plus your own exclusive listings. Star a property to feature it
            on your site.
            {featuredCount > 0 ? ` ${featuredCount} featured.` : ""}
          </p>
        </div>
        {canCreate ? (
          <Link to="/listings/new">
            <Button>
              <Plus className="size-4" />
              Add exclusive listing
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by address or city"
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
          />
          Show removed
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-base)] border border-dashed border-border p-10 text-center">
          <p className="font-medium">No listings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length === 0
              ? "Connect REALTOR.ca in Integrations to sync your listings, or add an exclusive listing."
              : "No listings match your filters."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[var(--radius-base)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {canFeature ? <th className="w-12 px-3 py-2" /> : null}
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Beds/Baths</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                {showActions ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t border-border align-middle">
                  {canFeature ? (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(it)}
                        disabled={busyId === it.id || it.status !== "active"}
                        aria-pressed={it.featured}
                        aria-label={it.featured ? "Unfeature" : "Feature"}
                        title={
                          it.status !== "active"
                            ? "Only active listings can be featured"
                            : "Feature"
                        }
                        className="text-muted-foreground transition-colors hover:text-brand disabled:opacity-40"
                      >
                        <Star className={`size-5 ${it.featured ? "fill-brand text-brand" : ""}`} />
                      </button>
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {it.primaryPhoto ? (
                        // Thumbnails are source URLs (DDF watermarks preserved); never re-hosted.
                        <img
                          src={it.primaryPhoto}
                          alt=""
                          className="size-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="size-12 shrink-0 rounded bg-muted/20" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {it.address ?? "Address unavailable"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {it.cityProvince ?? ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{it.price ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {it.beds ?? "—"} / {it.baths ?? "—"}
                  </td>
                  <td className="px-3 py-2">{it.propertyType ?? "—"}</td>
                  <td className="px-3 py-2">
                    <SourceBadge source={it.source} />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.status === "active" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}
                    >
                      {it.status}
                    </span>
                  </td>
                  {showActions ? (
                    <td className="px-3 py-2">
                      {canEditRow(it) ? (
                        <div className="flex items-center gap-1">
                          <Link
                            to="/listings/$listingId/edit"
                            params={{ listingId: it.id }}
                            aria-label="Edit"
                            title="Edit"
                            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            <Pencil className="size-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => deleteListing(it)}
                            disabled={busyId === it.id}
                            aria-label="Delete"
                            title="Delete"
                            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toaster />
    </main>
  )
}
