import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// Stub schema for ingested listings. Filled out when the real DDF (and other source)
// normalizers land. `source` + `sourceListingId` uniquely identify an upstream record.
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
  (t) => [unique().on(t.source, t.sourceListingId)],
)
