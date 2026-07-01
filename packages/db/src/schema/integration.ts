import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { organization } from "./auth"

// One shape for both integration kinds. New listing sources / CRMs = new `provider`
// values, no schema change. `config` holds credentials, encrypted at the app layer
// (INTEGRATION_ENCRYPTION_KEY) before it lands here.
export const integration = pgTable("integration", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  kind: text().notNull(), // "listing_source" | "crm"
  provider: text().notNull(), // "ddf" | "fub" | ...
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  status: text().notNull().default("disconnected"), // disconnected | connected | error
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})
