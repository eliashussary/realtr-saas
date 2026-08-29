import { Link, createFileRoute } from "@tanstack/react-router"
import { ExclusiveListingForm } from "../components/exclusive-listing-form"

export const Route = createFileRoute("/_dashboard/listings/new")({
  component: NewExclusiveListing,
})

function NewExclusiveListing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/listings" className="text-sm text-brand hover:underline">
        ← Listings
      </Link>
      <h1 className="mt-3 font-heading text-3xl font-bold">New exclusive listing</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your own inventory — not from REALTOR.ca. It appears alongside your synced listings and can
        be featured.
      </p>
      <ExclusiveListingForm mode="create" />
    </main>
  )
}
