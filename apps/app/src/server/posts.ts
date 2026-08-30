import { isUniqueViolation } from "@realtr/db/errors"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// Blog post CRUD for the dashboard. Owner/admin only (post:manage). @realtr/db imports stay dynamic +
// inside handlers (server-only pg), per the app convention. Body is Markdown; it is rendered safely at
// read time, so nothing HTML is stored.

async function auth() {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  if (!result.ok) return { ok: false as const, code: "unauthorized" as const }
  if (!can(result.role, "post", "manage")) return { ok: false as const, code: "forbidden" as const }
  return { ok: true as const, authorization: result }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "post"
  )
}

const postInput = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(80).optional().default(""),
  excerpt: z.string().trim().max(500).optional().default(""),
  coverImageUrl: z.string().trim().max(2000).nullable().optional().default(null),
  bodyMarkdown: z.string().max(100_000).optional().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  seoTitle: z.string().trim().max(200).optional().default(""),
  seoDescription: z.string().trim().max(500).optional().default(""),
  noIndex: z.boolean().optional().default(false),
})

function toRepoInput(data: z.infer<typeof postInput>, authorMemberId: string | null) {
  return {
    slug: data.slug.trim() ? slugify(data.slug) : slugify(data.title),
    title: data.title,
    excerpt: data.excerpt,
    coverImageUrl: data.coverImageUrl?.trim() ? data.coverImageUrl.trim() : null,
    bodyMarkdown: data.bodyMarkdown,
    status: data.status,
    seoTitle: data.seoTitle,
    seoDescription: data.seoDescription,
    noIndex: data.noIndex,
    authorMemberId,
  }
}

export interface PostListItem {
  id: string
  title: string
  slug: string
  status: string
  updatedAt: string
  publishedAt: string | null
}

/** List all of the tenant's posts (any status) for the dashboard. */
export const listPostsFn = createServerFn({ method: "GET" }).handler(async () => {
  const a = await auth()
  if (!a.ok) return a
  const { db } = await import("@realtr/db")
  const { listPostsForOrg } = await import("@realtr/db/posts")
  const rows = await listPostsForOrg(db, a.authorization.organizationId)
  const posts: PostListItem[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
  }))
  return { ok: true as const, posts }
})

/** Load one post for editing. */
export const getPostFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { getPostForOrg } = await import("@realtr/db/posts")
    const p = await getPostForOrg(db, a.authorization.organizationId, data.postId)
    if (!p) return { ok: false as const, code: "not_found" as const }
    return {
      ok: true as const,
      post: {
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        coverImageUrl: p.coverImageUrl,
        bodyMarkdown: p.bodyMarkdown,
        status: p.status,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        noIndex: p.noIndex,
      },
    }
  })

export const createPostFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => postInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { createPost } = await import("@realtr/db/posts")
    try {
      const row = await createPost(
        db,
        a.authorization.organizationId,
        toRepoInput(data, a.authorization.memberId),
      )
      return { ok: true as const, id: row.id }
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false as const, code: "slug_taken" as const }
      throw error
    }
  })

const updateInput = postInput.extend({ postId: z.string().uuid() })

export const updatePostFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { updatePost } = await import("@realtr/db/posts")
    try {
      const row = await updatePost(
        db,
        a.authorization.organizationId,
        data.postId,
        toRepoInput(data, a.authorization.memberId),
      )
      if (!row) return { ok: false as const, code: "not_found" as const }
      return { ok: true as const }
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false as const, code: "slug_taken" as const }
      throw error
    }
  })

export const deletePostFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { deletePost } = await import("@realtr/db/posts")
    const removed = await deletePost(db, a.authorization.organizationId, data.postId)
    return removed ? { ok: true as const } : { ok: false as const, code: "not_found" as const }
  })
