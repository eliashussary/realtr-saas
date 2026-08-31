import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { geometry } from "./spatial"

// Neighbourhood (and other) boundary polygons — GLOBAL reference data, not tenant-scoped. A tenant's
// listings intersect whatever areas cover their market (point-in-polygon via PostGIS), so one shared
// table serves every site. Isolation stays on the listing side (org-scoped); areas are just geography.
//
// Seeded from a per-market GeoJSON descriptor via `loadAreas`. `id` is the full source path (stable
// slug, upsert key) and also carries the whole hierarchy, e.g. "gta_toronto-division_toronto_downtown_bay-st-corridor".
//
// Hierarchy (for the filter UI's grouped display + duplicate-name disambiguation):
//   parentRegion — the GROUP level (e.g. Toronto / Durham Region for the GTA; null for flat markets).
//   region       — the IMMEDIATE parent (e.g. a city: Toronto, Ajax, Oshawa; null for flat markets).
// Both are normalized from the source dataset at load time (see data/areas/datasets/*.json), so the
// schema never assumes a particular market's path depth or delimiter.
export const area = pgTable(
  "area",
  {
    id: text().primaryKey(), // stable full source path, e.g. "ottawa_airport" or a gta_* path
    name: text().notNull(),
    kind: text().notNull().default("neighbourhood"), // neighbourhood | city | region | …
    region: text(), // immediate parent key (e.g. city "ajax"); null for flat markets
    parentRegion: text(), // group key (e.g. "durham-region", "toronto"); null for flat markets
    sourceId: text(), // upstream dataset id, for reconciliation
    sourceName: text(), // dataset provenance
    geom: geometry("geom", { type: "MultiPolygon" }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    // GiST index powers the point-in-polygon intersection against listing points.
    index("area_geom_gist").using("gist", t.geom),
    index("area_kind_region_idx").on(t.kind, t.region, t.parentRegion),
  ],
)
