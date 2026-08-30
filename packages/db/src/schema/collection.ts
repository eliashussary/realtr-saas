import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { organization } from "./auth"

// Property collections (M8): a named, saved listing filter the realtor curates — "Luxury homes",
// "Barrhaven condos", etc. Org-scoped and owner/admin-managed. `filter` stores exactly the public
// ListingFilter shape (@realtr/core), so a collection page just runs that filter. Public visibility is
// gated by `status` = published; `rank` orders them in the "popular searches" surface (lower first).
export const listingCollection = pgTable(
  "listing_collection",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text().notNull(), // URL slug within the tenant, e.g. "luxury-homes"
    name: text().notNull(),
    description: text().notNull().default(""),
    // The saved search — a @realtr/core ListingFilter. Kept as jsonb so it round-trips unchanged.
    filter: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text().notNull().default("draft"), // draft | published
    rank: integer(), // order in the popular-searches surface; lower first, nulls last
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("listing_collection_organization_slug_unique").on(t.organizationId, t.slug),
    index("listing_collection_org_status_rank_idx").on(t.organizationId, t.status, t.rank),
  ],
)
