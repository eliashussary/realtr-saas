import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// Blog posts (M-blog). Org-scoped content authored in Markdown and rendered as rich text. Public
// visibility is gated by `status` = published + a non-null `publishedAt`; the renderer serves only
// published posts for the resolved tenant. `bodyMarkdown` is the source of truth; it is rendered
// safely (react-markdown, no raw HTML) so it carries no stored HTML/XSS surface.
export const post = pgTable(
  "post",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Author attribution; kept if the member is later removed.
    authorMemberId: text().references(() => member.id, { onDelete: "set null" }),
    slug: text().notNull(), // URL slug within the tenant, e.g. "spring-market-update"
    title: text().notNull(),
    excerpt: text().notNull().default(""),
    coverImageUrl: text(),
    bodyMarkdown: text().notNull().default(""),
    status: text().notNull().default("draft"), // draft | published
    publishedAt: timestamp(),
    // SEO overrides (fall back to title/excerpt when empty).
    seoTitle: text().notNull().default(""),
    seoDescription: text().notNull().default(""),
    noIndex: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("post_organization_slug_unique").on(t.organizationId, t.slug),
    // Public listing: a tenant's published posts, newest first.
    index("post_org_status_published_idx").on(t.organizationId, t.status, t.publishedAt),
  ],
)
