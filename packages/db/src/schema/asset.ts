import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// Org-owned uploaded files (images first). A general media library: listings, site logo
// (`settings.logoAssetId`), blog posts, and agent photos all reference an asset by `id` or `url`.
// The bytes live in an AssetStore (local disk in dev, object storage in prod) keyed by `storageKey`;
// `url` is the resolved public URL at upload time for direct consumption by the renderer/dashboard.
export const asset = pgTable(
  "asset",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByMemberId: text().references(() => member.id, { onDelete: "set null" }),
    kind: text().notNull().default("image"), // image (future: document, video, …)
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    storageKey: text().notNull(), // key within the AssetStore
    url: text().notNull(), // resolved public URL
    originalFilename: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("asset_org_created_idx").on(t.organizationId, t.createdAt)],
)
