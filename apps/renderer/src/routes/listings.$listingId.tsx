import { createFileRoute } from "@tanstack/react-router"
import { ListingDetailPage, listingDetailHead, loadListingDetailRoute } from "../listings-data"

export const Route = createFileRoute("/listings/$listingId")({
  loader: ({ params }) => loadListingDetailRoute(params.listingId),
  head: ({ loaderData }) => listingDetailHead(loaderData),
  component: ListingDetailRoute,
})

function ListingDetailRoute() {
  return <ListingDetailPage data={Route.useLoaderData()} />
}
