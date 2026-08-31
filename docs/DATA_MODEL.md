# Data model: Areas & neighbourhood curation

This page pins the invariants for the area (neighbourhood boundary) data and the per-tenant
curation layer, so a future market can be added by dropping a dataset in rather than changing code.

## Scope (today)

Two markets only: **Ottawa** and **Toronto (GTA)**. Adding a third market is a data task — a new
GeoJSON + a small descriptor — not a schema or code change (see "Adding a market" below).

## Tables

### `area` — global reference data

Boundary polygons, shared across every tenant. A tenant's listings intersect whatever areas cover
their market (point-in-polygon via PostGIS), so one global table serves every site. Isolation stays
on the listing side (org-scoped); areas are just geography.

| column         | meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `id` (pk)      | Full source path — the stable, upsert key. e.g. `ottawa_airport`, `gta_toronto-division_toronto_downtown_bay-st-corridor`. |
| `name`         | Display name (e.g. "Bay Street Corridor"). Not unique — names repeat across cities. |
| `kind`         | `neighbourhood` (only kind loaded today). |
| `region`       | **Immediate parent** key — the city (most hoods) or district (Toronto proper). e.g. `ajax`, `downtown`. Null for flat markets. |
| `parentRegion` | **Group** key — the regional level the `region` sits in. e.g. `durham-region`, `toronto`. Null for flat markets. |
| `sourceId`     | Upstream dataset id (for reconciliation). |
| `sourceName`   | Dataset provenance (e.g. GeoOttawa, "web scrape"). |
| `geom`         | PostGIS `MultiPolygon`, SRID 4326. Stored via `st_multi(st_setsrid(st_geomfromgeojson(...),4326))`. |

**Hierarchy framing:** `parentRegion` is the *group* (collapsible section header), `region` is the
*immediate parent* (the city/district sub-group). For Toronto this is `gta / region / [city /] district / neighbourhood`,
encoded in the `id` path. For a flat market (Ottawa) both are null and the UI groups everything under
the market name.

**Duplicate names** are disambiguated by their `region`/`parentRegion` in the UI, not by making
`name` unique: "Lakeview (Oshawa)" vs "Lakeview (Mississauga)", "Dorset Park (Milton)" vs
"Dorset Park (Scarborough)".

### `org_area` — tenant curation

Which neighbourhood areas a tenant's public site's area filter offers, and in what order.

| column            | meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `organization_id` | Tenant boundary (FK → organization, cascade).                  |
| `area_id`         | Global area (FK → area.id, cascade).                           |
| `rank`            | Curation order (lower first, nulls last).                      |

- **Presence = curated.** A row means the area is offered in this tenant's filter.
- Curation **narrows the filter menu only** — search still uses full polygons, so a listing in an
  uncurated area still shows in search results. It never hides inventory.
- A tenant with **no curated areas** falls back to "all areas containing their active listings"
  (handled in `listCuratedAreas`, not stored) so a fresh tenant isn't stuck with an empty filter.

## Read path

- `listCuratedAreas(orgId, {serviceArea})` → the filter's area list: curated set rank-ordered with
  live listing counts, falling back to `listAreaFacets` when nothing is curated.
- `publishedAreaFacets(orgId)` (core) → the renderer's area filter (grouped `parentRegion` →
  `region`).
- `getAreaPolygons(ids)` → GeoJSON for the selected areas (map outlines + curation map).

## Seeding

`pnpm db:seed-areas` (root) / `pnpm db:seed-areas` in `packages/db` loads every dataset descriptor in
`packages/db/data/areas/datasets/` and upserts its GeoJSON via `loadAreas`. Idempotent — re-run to
refresh a market when its dataset changes.

Each **dataset descriptor** (`data/areas/datasets/<market>.json`) is the data-driven seam that lets
"add a market" be a GeoJSON + a small JSON, never a code change:

- `market`, `file`, `sourceName` — identity + provenance.
- `idSource` (`id` | `name`) + `idPrefix` — how the stable `area.id` is built (name-sourced ids are
  kebab-cased; Ottawa `"3001"` → `ottawa_airport`).
- `idPattern` — the id **must** match this or the loader **fails loudly** (a wrong-shaped dataset is
  a data bug, not something to silently mis-group).
- `hierarchy.areaType` — the feature type that is a filterable area (`null` = keep all; Toronto drops
  localities/parents).
- `hierarchy.region` / `hierarchy.parentRegion` — per-column mapping. `{type:"path", index:n}` reads
  segment `n` of the id split on `_` (**negative indexes count from the end**, so a variable-depth
  path maps the same way); `{type:"prop", key:k}` reads a feature property; `null` = leave null.

## Invariants

1. `area` is **global**; never tenant-scoped. Isolation lives on `listing` (org-scoped) and
   `org_area` (org-scoped).
2. `geom` is always SRID 4326, always a `MultiPolygon` (the loader coerces `Polygon` → `MultiPolygon`).
3. `area.id` is the upsert key and is **immutable** per source feature — changing a dataset's id
   scheme orphans the old rows.
4. A tenant can only curate areas that exist in the global `area` table (FK). The curation query is
   scoped by `organizationId` — a bogus or cross-tenant id cannot be curated.
5. Curation never changes which listings are searchable — only the order/subset of the filter menu.

## Adding a market

1. Drop the GeoJSON into `packages/db/data/areas/<market>.json`.
2. Add `packages/db/data/areas/datasets/<market>.json` describing its id shape + hierarchy mapping.
3. Run `pnpm db:seed-areas`. The loader fails loudly on any feature whose id doesn't match the
   pattern, so a mis-shaped dataset is caught at load time, not as silently-broken filters.

No schema, code, or UI change is required for a market that follows the same `parentRegion`/`region`
grouping convention.
