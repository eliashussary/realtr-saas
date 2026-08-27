import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// Stub schema for ingested listings. Filled out when the real DDF (and other source)
// normalizers land. Provider identity is tenant-local: future sync conflict targets and
// lookups must use `organizationId` + `source` + `sourceListingId`. A later canonical
// cross-provider identity may reference these source records without weakening this boundary.
export const listing = pgTable(
  "listing",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // optional agent attribution within a brokerage
    memberId: text().references(() => member.id, { onDelete: "set null" }),
    source: text().notNull(), // provider tag, e.g. "ddf"
    sourceListingId: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("listing_organization_source_source_listing_id_unique").on(
      t.organizationId,
      t.source,
      t.sourceListingId,
    ),
  ],
)
