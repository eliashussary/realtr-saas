import { doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { organization } from "./auth"

// A tenant's serviced market as a bounding box (WGS84). One row per org (organizationId is the PK) —
// presence means "configured". Two uses: it bounds what the DDF sync pulls (Latitude/Longitude
// filter), and it constrains the public site to that market (feed listings outside the box are
// hidden; the realtor's own manual listings are always shown). A future version can add polygon/area
// service areas alongside this box.
export const serviceArea = pgTable("service_area", {
  organizationId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  minLng: doublePrecision().notNull(),
  minLat: doublePrecision().notNull(),
  maxLng: doublePrecision().notNull(),
  maxLat: doublePrecision().notNull(),
  label: text(), // optional human label, e.g. "Ottawa & west suburbs"
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})
