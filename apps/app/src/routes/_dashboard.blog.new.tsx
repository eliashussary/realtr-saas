import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { PostForm, type PostFormValues, emptyPost } from "../components/post-form"
import { createPostFn } from "../server/posts"

export const Route = createFileRoute("/_dashboard/blog/new")({
  component: NewPost,
})

function NewPost() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const save = async (values: PostFormValues) => {
    setSaving(true)
    const res = await createPostFn({
      data: {
        title: values.title,
        slug: values.slug,
        excerpt: values.excerpt,
        coverImageUrl: values.coverImageUrl,
        bodyMarkdown: values.bodyMarkdown,
        status: values.status,
        seoTitle: values.seoTitle,
        seoDescription: values.seoDescription,
        noIndex: values.noIndex,
      },
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Post created.")
      await router.navigate({ to: "/blog/$postId/edit", params: { postId: res.id } })
    } else if (res.code === "slug_taken") {
      toast.error("That URL slug is already used by another post.")
    } else if (res.code === "forbidden") {
      toast.error("Only owners and admins can write posts.")
    } else {
      toast.error("Could not create the post.")
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/blog" className="text-sm text-brand hover:underline">
        ← Blog
      </Link>
      <h1 className="mt-2 font-heading text-3xl font-bold">New post</h1>
      <div className="mt-8">
        <PostForm initial={emptyPost} saving={saving} onSave={(v) => void save(v)} />
      </div>
      <Toaster />
    </main>
  )
}
