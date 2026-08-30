import { createFileRoute } from "@tanstack/react-router"
import { BlogPostPage, blogPostHead, loadBlogPostRoute } from "../blog-data"

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => loadBlogPostRoute(params.slug),
  head: ({ loaderData }) => blogPostHead(loaderData),
  component: BlogPostRoute,
})

function BlogPostRoute() {
  return <BlogPostPage data={Route.useLoaderData()} />
}
