import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { PostForm, type PostFormValues } from "../components/post-form"
import { deletePostFn, getPostFn, updatePostFn } from "../server/posts"

export const Route = createFileRoute("/_dashboard/blog/$postId/edit")({
  loader: ({ params }) => getPostFn({ data: { postId: params.postId } }),
  component: EditPost,
})

function EditPost() {
  const router = useRouter()
  const { postId } = Route.useParams()
  const data = Route.useLoaderData()
  const [saving, setSaving] = useState(false)

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">
          {data.code === "not_found" ? "Post not found" : "Not authorized"}
        </h1>
        <Link to="/blog" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to blog
        </Link>
      </main>
    )
  }

  const initial: PostFormValues = {
    title: data.post.title,
    slug: data.post.slug,
    excerpt: data.post.excerpt,
    coverImageUrl: data.post.coverImageUrl,
    bodyMarkdown: data.post.bodyMarkdown,
    status: data.post.status === "published" ? "published" : "draft",
    seoTitle: data.post.seoTitle,
    seoDescription: data.post.seoDescription,
    noIndex: data.post.noIndex,
  }

  const save = async (values: PostFormValues) => {
    setSaving(true)
    const res = await updatePostFn({ data: { postId, ...values } })
    setSaving(false)
    if (res.ok) {
      toast.success("Saved.")
      await router.invalidate()
    } else if (res.code === "slug_taken") {
      toast.error("That URL slug is already used by another post.")
    } else if (res.code === "not_found") {
      toast.error("This post no longer exists.")
    } else {
      toast.error("Could not save the post.")
    }
  }

  const remove = async () => {
    if (!window.confirm("Delete this post? This cannot be undone.")) return
    setSaving(true)
    const res = await deletePostFn({ data: { postId } })
    setSaving(false)
    if (res.ok) {
      toast.success("Post deleted.")
      await router.navigate({ to: "/blog" })
    } else {
      toast.error("Could not delete the post.")
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/blog" className="text-sm text-brand hover:underline">
        ← Blog
      </Link>
      <h1 className="mt-2 font-heading text-3xl font-bold">Edit post</h1>
      <div className="mt-8">
        <PostForm
          initial={initial}
          saving={saving}
          onSave={(v) => void save(v)}
          onDelete={() => void remove()}
        />
      </div>
      <Toaster />
    </main>
  )
}
