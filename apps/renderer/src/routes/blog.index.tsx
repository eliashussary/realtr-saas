import { createFileRoute } from "@tanstack/react-router"
import { BlogIndexPage, blogIndexHead, loadBlogIndexRoute } from "../blog-data"

export const Route = createFileRoute("/blog/")({
  loader: () => loadBlogIndexRoute(),
  head: ({ loaderData }) => blogIndexHead(loaderData),
  component: BlogIndexRoute,
})

function BlogIndexRoute() {
  return <BlogIndexPage data={Route.useLoaderData()} />
}
