import { db } from "@realtr/db"
import { type PostRow, getPublishedPostBySlug, listPublishedPosts } from "@realtr/db/posts"

// Public read side for the renderer: a tenant's published blog posts. Kept behind core so the renderer
// never touches the db directly and reads stay tenant-scoped + published-only.
export type { PostRow }

export function listPublishedBlogPosts(organizationId: string): Promise<PostRow[]> {
  return listPublishedPosts(db, organizationId)
}

export function getPublishedBlogPost(
  organizationId: string,
  slug: string,
): Promise<PostRow | null> {
  return getPublishedPostBySlug(db, organizationId, slug)
}
