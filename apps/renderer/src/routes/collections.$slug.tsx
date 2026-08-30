import { createFileRoute } from "@tanstack/react-router"
import {
  CollectionDetailPage,
  collectionDetailHead,
  loadCollectionDetailRoute,
} from "../collections-data"

export const Route = createFileRoute("/collections/$slug")({
  loader: ({ params }) => loadCollectionDetailRoute(params.slug),
  head: ({ loaderData }) => collectionDetailHead(loaderData),
  component: CollectionDetailRoute,
})

function CollectionDetailRoute() {
  return <CollectionDetailPage data={Route.useLoaderData()} />
}
