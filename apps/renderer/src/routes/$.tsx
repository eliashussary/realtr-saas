import { createFileRoute } from "@tanstack/react-router"
import { PublishedPage, loadPublishedRoute, publishedHead } from "../published-site"

// Catch-all for non-home tenant pages, resolved by slug against the live published revision.
export const Route = createFileRoute("/$")({
  loader: ({ params }) => loadPublishedRoute(params._splat ?? ""),
  head: ({ loaderData }) => publishedHead(loaderData),
  component: SplatPage,
})

function SplatPage() {
  return <PublishedPage data={Route.useLoaderData()} />
}
