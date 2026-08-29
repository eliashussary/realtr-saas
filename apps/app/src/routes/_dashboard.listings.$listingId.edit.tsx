import { Link, createFileRoute } from "@tanstack/react-router"
import { ExclusiveListingForm } from "../components/exclusive-listing-form"
import { getExclusiveListingFn } from "../server/listings"

export const Route = createFileRoute("/_dashboard/listings/$listingId/edit")({
  loader: ({ params }) => getExclusiveListingFn({ data: { listingId: params.listingId } }),
  component: EditExclusiveListing,
})

function EditExclusiveListing() {
  const data = Route.useLoaderData()
  const { listingId } = Route.useParams()

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Listing not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This exclusive listing doesn't exist or isn't editable.
        </p>
        <Link to="/listings" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Listings
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/listings" className="text-sm text-brand hover:underline">
        ← Listings
      </Link>
      <h1 className="mt-3 font-heading text-3xl font-bold">Edit exclusive listing</h1>
      <ExclusiveListingForm mode="edit" listingId={listingId} initial={data.form} />
    </main>
  )
}
