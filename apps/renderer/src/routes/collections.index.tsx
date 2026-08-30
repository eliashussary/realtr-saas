import { createFileRoute } from "@tanstack/react-router"
import {
  CollectionsIndexPage,
  collectionsIndexHead,
  loadCollectionsIndexRoute,
} from "../collections-data"

export const Route = createFileRoute("/collections/")({
  loader: () => loadCollectionsIndexRoute(),
  head: ({ loaderData }) => collectionsIndexHead(loaderData),
  component: CollectionsIndexRoute,
})

function CollectionsIndexRoute() {
  return <CollectionsIndexPage data={Route.useLoaderData()} />
}
