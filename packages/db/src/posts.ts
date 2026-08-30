import { and, desc, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { post } from "./schema"
import type * as schema from "./schema"

// Blog post repository. All reads/writes are org-scoped; public reads additionally require published
// status. Kept behind @realtr/db so the app (dashboard CRUD) and @realtr/core (public reads) share it.
export type PostDatabase = NodePgDatabase<typeof schema>
export type PostRow = typeof post.$inferSelect

export interface PostInput {
  slug: string
  title: string
  excerpt: string
  coverImageUrl: string | null
  bodyMarkdown: string
  status: "draft" | "published"
  seoTitle: string
  seoDescription: string
  noIndex: boolean
  authorMemberId: string | null
}

// Set publishedAt the first time a post becomes published; clear it if unpublished.
function publishedAtFor(status: string, existing: Date | null): Date | null {
  if (status !== "published") return null
  return existing ?? new Date()
}

export async function listPostsForOrg(
  database: PostDatabase,
  organizationId: string,
): Promise<PostRow[]> {
  return database
    .select()
    .from(post)
    .where(eq(post.organizationId, organizationId))
    .orderBy(desc(post.updatedAt))
}

export async function getPostForOrg(
  database: PostDatabase,
  organizationId: string,
  id: string,
): Promise<PostRow | null> {
  const [row] = await database
    .select()
    .from(post)
    .where(and(eq(post.id, id), eq(post.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function createPost(
  database: PostDatabase,
  organizationId: string,
  input: PostInput,
): Promise<PostRow> {
  const [row] = await database
    .insert(post)
    .values({
      organizationId,
      authorMemberId: input.authorMemberId,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      coverImageUrl: input.coverImageUrl,
      bodyMarkdown: input.bodyMarkdown,
      status: input.status,
      publishedAt: publishedAtFor(input.status, null),
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      noIndex: input.noIndex,
    })
    .returning()
  if (!row) throw new Error("Failed to create post")
  return row
}

/** Update a post, scoped to its org. Returns the updated row, or null if it doesn't belong to the org. */
export async function updatePost(
  database: PostDatabase,
  organizationId: string,
  id: string,
  input: PostInput,
): Promise<PostRow | null> {
  const existing = await getPostForOrg(database, organizationId, id)
  if (!existing) return null
  const [row] = await database
    .update(post)
    .set({
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      coverImageUrl: input.coverImageUrl,
      bodyMarkdown: input.bodyMarkdown,
      status: input.status,
      publishedAt: publishedAtFor(input.status, existing.publishedAt),
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      noIndex: input.noIndex,
      updatedAt: new Date(),
    })
    .where(and(eq(post.id, id), eq(post.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function deletePost(
  database: PostDatabase,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await database
    .delete(post)
    .where(and(eq(post.id, id), eq(post.organizationId, organizationId)))
  return (result.rowCount ?? 0) > 0
}

// --- Public reads (published only) ---

export async function listPublishedPosts(
  database: PostDatabase,
  organizationId: string,
): Promise<PostRow[]> {
  return database
    .select()
    .from(post)
    .where(and(eq(post.organizationId, organizationId), eq(post.status, "published")))
    .orderBy(desc(post.publishedAt))
}

export async function getPublishedPostBySlug(
  database: PostDatabase,
  organizationId: string,
  slug: string,
): Promise<PostRow | null> {
  const [row] = await database
    .select()
    .from(post)
    .where(
      and(
        eq(post.organizationId, organizationId),
        eq(post.slug, slug),
        eq(post.status, "published"),
      ),
    )
    .limit(1)
  return row ?? null
}
