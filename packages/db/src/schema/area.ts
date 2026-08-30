import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { geometry } from "./spatial"

// Neighbourhood (and other) boundary polygons — GLOBAL reference data, not tenant-scoped. A tenant's
// listings intersect whatever areas cover their market (point-in-polygon via PostGIS), so one shared
// table serves every site. Isolation stays on the listing side (org-scoped); areas are just geography.
// Seeded from GeoJSON via `loadAreas`; the id is a stable slug (e.g. "ottawa_glebe").
export const area = pgTable(
  "area",
  {
    id: text().primaryKey(), // stable slug, e.g. "ottawa_glebe"
    name: text().notNull(),
    kind: text().notNull().default("neighbourhood"), // neighbourhood | city | region | …
    region: text(), // optional grouping key for the filter UI (e.g. "ottawa", "toronto_division")
    sourceId: text(), // upstream dataset id, for reconciliation
    sourceName: text(), // dataset provenance
    geom: geometry("geom", { type: "MultiPolygon" }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    // GiST index powers the point-in-polygon intersection against listing points.
    index("area_geom_gist").using("gist", t.geom),
    index("area_kind_region_idx").on(t.kind, t.region),
  ],
)
