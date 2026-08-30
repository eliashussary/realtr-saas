import { buttonVariants } from "@realtr/ui/components/button"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute } from "@tanstack/react-router"
import { LocalTime } from "../components/local-time"
import { listPostsFn } from "../server/posts"

export const Route = createFileRoute("/_dashboard/blog/")({
  loader: () => listPostsFn(),
  component: BlogIndex,
})

function BlogIndex() {
  const data = Route.useLoaderData()

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and admins can manage the blog.
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
          <h1 className="font-heading text-3xl font-bold">Blog</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Write posts in Markdown; publish to show them on your site's blog.
          </p>
        </div>
        <Link to="/blog/new" className={buttonVariants()}>
          New post
        </Link>
      </div>

      {data.posts.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No posts yet. Write your first one.</p>
      ) : (
        <div className="mt-8 flex flex-col divide-y divide-border rounded-lg border border-border">
          {data.posts.map((p) => (
            <Link
              key={p.id}
              to="/blog/$postId/edit"
              params={{ postId: p.id }}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "published"
                        ? "bg-success/15 text-success"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">/blog/{p.slug}</div>
              </div>
              <span className="text-xs text-muted-foreground">
                Updated <LocalTime iso={p.updatedAt} />
              </span>
            </Link>
          ))}
        </div>
      )}
      <Toaster />
    </main>
  )
}
