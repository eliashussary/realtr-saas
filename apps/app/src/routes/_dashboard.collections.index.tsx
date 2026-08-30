import { buttonVariants } from "@realtr/ui/components/button"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute } from "@tanstack/react-router"
import { LocalTime } from "../components/local-time"
import { listCollectionsFn } from "../server/collections"

export const Route = createFileRoute("/_dashboard/collections/")({
  loader: () => listCollectionsFn(),
  component: CollectionsIndex,
})

function CollectionsIndex() {
  const data = Route.useLoaderData()

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and admins can manage collections.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Collections</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Curated, saved searches — "Luxury homes", "Barrhaven condos" — shown as popular searches
            and their own pages.
          </p>
        </div>
        <Link to="/collections/new" className={buttonVariants()}>
          New collection
        </Link>
      </div>

      {data.collections.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No collections yet. Create your first saved search.
        </p>
      ) : (
        <div className="mt-8 flex flex-col divide-y divide-border rounded-lg border border-border">
          {data.collections.map((c) => (
            <Link
              key={c.id}
              to="/collections/$collectionId/edit"
              params={{ collectionId: c.id }}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "published"
                        ? "bg-success/15 text-success"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  /collections/{c.slug}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                Updated <LocalTime iso={c.updatedAt} />
              </span>
            </Link>
          ))}
        </div>
      )}
      <Toaster />
    </main>
  )
}
