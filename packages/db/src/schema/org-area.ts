import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { area } from "./area"
import { organization } from "./auth"

// A tenant's curation of which neighbourhood areas its public site's area filter offers, and in what
// order. Org-scoped, owner/admin-managed (area:manage). `area` is GLOBAL reference data — this table
// is the only tenant-scoped layer on top of it: it picks a subset of global areas and ranks them.
//
// Presence of a row = that area is offered in this tenant's filter. `rank` orders it (lower first;
// nulls last). Curation narrows the FILTER MENU, not search: a listing in an uncurated area still
// shows in search (st_intersects is unaffected). A tenant with no curated areas falls back to "all
// areas containing its active listings" (handled in the read layer, not here).
export const orgArea = pgTable(
  "org_area",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    areaId: text()
      .notNull()
      .references(() => area.id, { onDelete: "cascade" }),
    rank: integer(), // curation order in the filter; lower first, nulls last
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("org_area_org_area_unique").on(t.organizationId, t.areaId),
    index("org_area_org_rank_idx").on(t.organizationId, t.rank),
  ],
)
