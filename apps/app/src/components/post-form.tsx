import { MarkdownContent } from "@realtr/site"
import { Button } from "@realtr/ui/components/button"
import { Field, FieldDescription, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useState } from "react"
import { ImageUpload } from "./image-upload"

export interface PostFormValues {
  title: string
  slug: string
  excerpt: string
  coverImageUrl: string | null
  bodyMarkdown: string
  status: "draft" | "published"
  seoTitle: string
  seoDescription: string
  noIndex: boolean
}

export const emptyPost: PostFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  coverImageUrl: null,
  bodyMarkdown: "",
  status: "draft",
  seoTitle: "",
  seoDescription: "",
  noIndex: false,
}

export function PostForm({
  initial,
  saving,
  onSave,
  onDelete,
}: {
  initial: PostFormValues
  saving: boolean
  onSave: (values: PostFormValues, status: "draft" | "published") => void
  onDelete?: () => void
}) {
  const [v, setV] = useState<PostFormValues>(initial)
  const [tab, setTab] = useState<"write" | "preview">("write")
  const set = (patch: Partial<PostFormValues>) => setV((prev) => ({ ...prev, ...patch }))

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(v, v.status)
      }}
    >
      <Field>
        <FieldLabel htmlFor="post-title">Title</FieldLabel>
        <Input
          id="post-title"
          value={v.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-invalid={v.title.trim() === "" || undefined}
          placeholder="Spring market update"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="post-slug">URL slug</FieldLabel>
        <Input
          id="post-slug"
          value={v.slug}
          onChange={(e) => set({ slug: e.target.value })}
          placeholder="spring-market-update"
          className="font-mono"
        />
        <FieldDescription>Leave blank to generate one from the title.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="post-excerpt">Excerpt</FieldLabel>
        <Input
          id="post-excerpt"
          value={v.excerpt}
          onChange={(e) => set({ excerpt: e.target.value })}
          placeholder="A short summary shown in the blog list and social previews."
        />
      </Field>

      <Field>
        <FieldLabel>Cover image</FieldLabel>
        <ImageUpload
          value={v.coverImageUrl ? [v.coverImageUrl] : []}
          max={1}
          onChange={(urls) => set({ coverImageUrl: urls[0] ?? null })}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="post-body">Body (Markdown)</FieldLabel>
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("write")}
              className={`rounded px-2 py-1 ${tab === "write" ? "bg-secondary font-medium" : "text-muted-foreground"}`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={`rounded px-2 py-1 ${tab === "preview" ? "bg-secondary font-medium" : "text-muted-foreground"}`}
            >
              Preview
            </button>
          </div>
        </div>
        {tab === "write" ? (
          <textarea
            id="post-body"
            value={v.bodyMarkdown}
            onChange={(e) => set({ bodyMarkdown: e.target.value })}
            rows={16}
            placeholder={
              "## Heading\n\nWrite your post in **Markdown**. Add [links](https://example.com), lists, and images."
            }
            className="min-h-72 w-full rounded-[var(--radius-base)] border border-input bg-transparent p-3 font-mono text-sm"
          />
        ) : (
          <div className="min-h-72 rounded-[var(--radius-base)] border border-border p-4">
            {v.bodyMarkdown.trim() ? (
              <MarkdownContent markdown={v.bodyMarkdown} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <details className="rounded-[var(--radius-base)] border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">SEO &amp; metadata</summary>
        <div className="mt-4 flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="post-seo-title">SEO title</FieldLabel>
            <Input
              id="post-seo-title"
              value={v.seoTitle}
              onChange={(e) => set({ seoTitle: e.target.value })}
              placeholder={v.title || "Falls back to the post title"}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="post-seo-desc">Meta description</FieldLabel>
            <Input
              id="post-seo-desc"
              value={v.seoDescription}
              onChange={(e) => set({ seoDescription: e.target.value })}
              placeholder={v.excerpt || "Falls back to the excerpt"}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={v.noIndex}
              onChange={(e) => set({ noIndex: e.target.checked })}
            />
            Hide this post from search engines
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving || v.title.trim() === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {v.status === "published" ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onSave({ ...v, status: "draft" }, "draft")}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={saving || v.title.trim() === ""}
              onClick={() => onSave({ ...v, status: "published" }, "published")}
            >
              Publish
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {v.status === "published" ? "Published" : "Draft"}
          </span>
        </div>
        {onDelete ? (
          <Button type="button" variant="destructive" disabled={saving} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}
