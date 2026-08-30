import { getPublishedBlogPost, listPublishedBlogPosts, resolvePublishedSite } from "@realtr/core"
import { MarkdownContent } from "@realtr/site"
import type { SiteDocumentV1 } from "@realtr/site/document"
import { createServerFn } from "@tanstack/react-start"
import { resolveOrigin, serializeJsonLd } from "./seo"
import { SiteShell } from "./site-shell"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

interface PostSummary {
  slug: string
  title: string
  excerpt: string
  coverImageUrl: string | null
  publishedAt: string | null
}

interface PostDetail extends PostSummary {
  bodyMarkdown: string
  seoTitle: string
  seoDescription: string
  noIndex: boolean
}

export type BlogIndexData =
  | { status: "ok"; document: Json; posts: PostSummary[]; origin: string }
  | { status: "not_found" }
  | { status: "error" }

export type BlogPostData =
  | { status: "ok"; document: Json; post: PostDetail; origin: string }
  | { status: "not_found" }
  | { status: "error" }

async function resolveHost() {
  const { getRequestHeader, setResponseStatus } = await import("@tanstack/react-start/server")
  const host = getRequestHeader("host") ?? ""
  const origin = resolveOrigin(host, getRequestHeader("x-forwarded-proto"))
  const site = await resolvePublishedSite(host)
  return { site, origin, setResponseStatus: setResponseStatus as (status: number) => void }
}

const loadBlogIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogIndexData> => {
    const { site, origin, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const rows = await listPublishedBlogPosts(site.organizationId)
    const posts: PostSummary[] = rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      coverImageUrl: p.coverImageUrl,
      publishedAt: p.publishedAt?.toISOString() ?? null,
    }))
    return { status: "ok", document: site.document as Json, posts, origin }
  },
)

const loadBlogPost = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<BlogPostData> => {
    const { site, origin, setResponseStatus } = await resolveHost()
    if (site.status === "error") {
      setResponseStatus(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    const p = await getPublishedBlogPost(site.organizationId, slug)
    if (!p) {
      setResponseStatus(404)
      return { status: "not_found" }
    }
    return {
      status: "ok",
      document: site.document as Json,
      origin,
      post: {
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        coverImageUrl: p.coverImageUrl,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        bodyMarkdown: p.bodyMarkdown,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        noIndex: p.noIndex,
      },
    }
  })

export function loadBlogIndexRoute(): Promise<BlogIndexData> {
  return loadBlogIndex()
}
export function loadBlogPostRoute(slug: string): Promise<BlogPostData> {
  return loadBlogPost({ data: slug })
}

function documentOf(data: BlogIndexData | BlogPostData): SiteDocumentV1 | null {
  return data.status === "ok" ? (data.document as unknown as SiteDocumentV1) : null
}

function formatDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : ""
}

// --- Head / SEO ---

export function blogIndexHead(data: BlogIndexData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Blog" }] }
  const title = `Blog — ${documentOf(data)?.settings.siteTitle ?? "Blog"}`
  return {
    meta: [{ title }, { property: "og:title", content: title }],
    links: [{ rel: "canonical", href: `${data.origin}/blog` }],
  }
}

export function blogPostHead(data: BlogPostData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Post not found" }] }
  const { post } = data
  const title = post.seoTitle || post.title
  const description = post.seoDescription || post.excerpt
  const meta: Array<Record<string, string>> = [
    { title },
    { property: "og:title", content: title },
    { property: "og:type", content: "article" },
  ]
  if (description) {
    meta.push({ name: "description", content: description })
    meta.push({ property: "og:description", content: description })
  }
  if (post.coverImageUrl) meta.push({ property: "og:image", content: post.coverImageUrl })
  if (post.noIndex) meta.push({ name: "robots", content: "noindex" })
  return {
    meta,
    links: [{ rel: "canonical", href: `${data.origin}/blog/${post.slug}` }],
  }
}

// --- Pages ---

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-10 text-center text-muted">
      {message}
    </div>
  )
}

export function BlogIndexPage({ data }: { data: BlogIndexData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This page could not be found." />
  const document = documentOf(data) as SiteDocumentV1

  return (
    <SiteShell document={document}>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-heading text-4xl font-bold text-foreground">Blog</h1>
        {data.posts.length === 0 ? (
          <p className="mt-8 text-muted">No posts yet.</p>
        ) : (
          <div className="mt-10 flex flex-col gap-10">
            {data.posts.map((p) => (
              <article key={p.slug} className="flex flex-col gap-3">
                {p.coverImageUrl ? (
                  <a href={`/blog/${p.slug}`}>
                    <img
                      src={p.coverImageUrl}
                      alt=""
                      className="aspect-[2/1] w-full rounded-[var(--radius-base)] object-cover"
                    />
                  </a>
                ) : null}
                <div>
                  {p.publishedAt ? (
                    <p className="text-sm text-muted">{formatDate(p.publishedAt)}</p>
                  ) : null}
                  <h2 className="mt-1 font-heading text-2xl font-semibold text-foreground">
                    <a href={`/blog/${p.slug}`} className="hover:text-brand">
                      {p.title}
                    </a>
                  </h2>
                  {p.excerpt ? <p className="mt-2 text-muted">{p.excerpt}</p> : null}
                  <a
                    href={`/blog/${p.slug}`}
                    className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                  >
                    Read more →
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  )
}

export function BlogPostPage({ data }: { data: BlogPostData }) {
  if (data.status === "error")
    return <Unavailable message="This site is temporarily unavailable." />
  if (data.status !== "ok") return <Unavailable message="This post could not be found." />
  const document = documentOf(data) as SiteDocumentV1
  const { post } = data

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.coverImageUrl || undefined,
    datePublished: post.publishedAt || undefined,
  }

  return (
    <SiteShell document={document}>
      <script
        type="application/ld+json"
        // JSON-LD; serializeJsonLd escapes `<` so it cannot break out of the script.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-6 py-16">
        {post.publishedAt ? (
          <p className="text-sm text-muted">{formatDate(post.publishedAt)}</p>
        ) : null}
        <h1 className="mt-1 font-heading text-4xl font-bold text-foreground">{post.title}</h1>
        {post.coverImageUrl ? (
          <img
            src={post.coverImageUrl}
            alt=""
            className="mt-6 aspect-[2/1] w-full rounded-[var(--radius-base)] object-cover"
          />
        ) : null}
        <div className="mt-8">
          <MarkdownContent markdown={post.bodyMarkdown} />
        </div>
        <p className="mt-12">
          <a href="/blog" className="text-sm font-medium text-brand hover:underline">
            ← All posts
          </a>
        </p>
      </article>
    </SiteShell>
  )
}
