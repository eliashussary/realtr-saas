import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  type PostInput,
  createPost,
  deletePost,
  getPublishedPostBySlug,
  listPostsForOrg,
  listPublishedPosts,
  updatePost,
} from "../src/posts"
import {
  type TestDatabase,
  cleanTestDatabase,
  createTestDatabase,
  migrateTestDatabase,
} from "../src/test/database"
import { createTwoTenantFixture } from "../src/test/fixtures"

function input(over: Partial<PostInput> = {}): PostInput {
  return {
    slug: "spring-update",
    title: "Spring update",
    excerpt: "The market this spring.",
    coverImageUrl: null,
    bodyMarkdown: "## Hello\n\nSome **markdown**.",
    status: "draft",
    seoTitle: "",
    seoDescription: "",
    noIndex: false,
    authorMemberId: null,
    ...over,
  }
}

describe("post repository", () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = createTestDatabase()
    await migrateTestDatabase(database)
  })
  beforeEach(async () => cleanTestDatabase(database))
  afterAll(async () => {
    if (!database) return
    await cleanTestDatabase(database)
    await database.pool.end()
  })

  it("creates a draft with no publishedAt; publishing stamps it, unpublishing clears it", async () => {
    const [alpha] = await createTwoTenantFixture(database)
    const org = alpha?.ids.organizationId ?? ""

    const draft = await createPost(database.db, org, input())
    expect(draft.status).toBe("draft")
    expect(draft.publishedAt).toBeNull()

    const published = await updatePost(database.db, org, draft.id, input({ status: "published" }))
    expect(published?.publishedAt).toBeInstanceOf(Date)
    const firstPublishedAt = published?.publishedAt

    // Re-saving while still published keeps the original publishedAt.
    const resaved = await updatePost(
      database.db,
      org,
      draft.id,
      input({ status: "published", title: "Spring update (edited)" }),
    )
    expect(resaved?.publishedAt).toEqual(firstPublishedAt)

    // Unpublishing clears it.
    const back = await updatePost(database.db, org, draft.id, input({ status: "draft" }))
    expect(back?.publishedAt).toBeNull()
  })

  it("public reads return only published posts, scoped to the tenant", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const org = alpha?.ids.organizationId ?? ""
    await createPost(database.db, org, input({ slug: "draft-post", status: "draft" }))
    await createPost(database.db, org, input({ slug: "live-post", status: "published" }))
    await createPost(
      database.db,
      beta?.ids.organizationId ?? "",
      input({ slug: "beta-post", status: "published" }),
    )

    const dashboard = await listPostsForOrg(database.db, org)
    expect(dashboard).toHaveLength(2) // draft + published

    const publicPosts = await listPublishedPosts(database.db, org)
    expect(publicPosts.map((p) => p.slug)).toEqual(["live-post"])

    expect(await getPublishedPostBySlug(database.db, org, "live-post")).not.toBeNull()
    expect(await getPublishedPostBySlug(database.db, org, "draft-post")).toBeNull() // drafts hidden
    expect(await getPublishedPostBySlug(database.db, org, "beta-post")).toBeNull() // other tenant
  })

  it("deletes only within the tenant", async () => {
    const [alpha, beta] = await createTwoTenantFixture(database)
    const org = alpha?.ids.organizationId ?? ""
    const post = await createPost(database.db, org, input())
    // Wrong tenant can't delete it.
    expect(await deletePost(database.db, beta?.ids.organizationId ?? "", post.id)).toBe(false)
    expect(await deletePost(database.db, org, post.id)).toBe(true)
    expect(await listPostsForOrg(database.db, org)).toHaveLength(0)
  })
})
