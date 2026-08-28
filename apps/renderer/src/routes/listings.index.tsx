import { createFileRoute } from "@tanstack/react-router"
import { ListingsGridPage, listingsGridHead, loadListingsGridRoute } from "../listings-data"

export const Route = createFileRoute("/listings/")({
  loader: () => loadListingsGridRoute(),
  head: ({ loaderData }) => listingsGridHead(loaderData),
  component: ListingsRoute,
})

function ListingsRoute() {
  return <ListingsGridPage data={Route.useLoaderData()} />
}
