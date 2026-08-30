import { sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { area } from "./schema"
import type { ServiceAreaBBox } from "./service-areas"

type Database = NodePgDatabase<typeof schema>

// A GeoJSON geometry (Polygon or MultiPolygon) — enough of the shape for ingestion; PostGIS validates
// the rest. Kept structural so the loader stays decoupled from any GeoJSON typings.
export interface AreaGeometryInput {
  type: string
  coordinates: unknown
}

export interface AreaFeatureInput {
  id: string
  name: string
  kind?: string
  region?: string | null
  sourceId?: string | null
  sourceName?: string | null
  geometry: AreaGeometryInput
}

/**
 * Ingest boundary polygons into the global `area` table (upsert by id). Any Polygon is coerced to
 * MultiPolygon to match the column. Idempotent — re-running with the same ids refreshes name/geometry.
 * This backs the data-load task; the app itself never writes areas.
 */
export async function loadAreas(
  database: Database,
  features: ReadonlyArray<AreaFeatureInput>,
): Promise<number> {
  if (features.length === 0) return 0
  const now = new Date()
  await database.transaction(async (tx) => {
    for (const f of features) {
      const geojson = JSON.stringify(f.geometry)
      await tx
        .insert(area)
        .values({
          id: f.id,
          name: f.name,
          kind: f.kind ?? "neighbourhood",
          region: f.region ?? null,
          sourceId: f.sourceId ?? null,
          sourceName: f.sourceName ?? null,
          // Coerce Polygon → MultiPolygon so mixed inputs fit the MultiPolygon column.
          geom: sql`st_multi(st_setsrid(st_geomfromgeojson(${geojson}), 4326))`,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: area.id,
          set: {
            name: f.name,
            kind: f.kind ?? "neighbourhood",
            region: f.region ?? null,
            sourceId: f.sourceId ?? null,
            sourceName: f.sourceName ?? null,
            geom: sql`st_multi(st_setsrid(st_geomfromgeojson(${geojson}), 4326))`,
            updatedAt: now,
          },
        })
    }
  })
  return features.length
}

export interface AreaFacet {
  id: string
  name: string
  region: string | null
  count: number
}

/**
 * Areas that actually contain a tenant's active listings, with match counts — so the filter offers
 * only meaningful neighbourhoods. Point-in-polygon via the GiST-indexed geometries.
 */
export async function listAreaFacets(
  database: Database,
  organizationId: string,
  options: { serviceArea?: ServiceAreaBBox } = {},
): Promise<AreaFacet[]> {
  // When a service area is set, only listings inside it (or manual) contribute to the area facets, so
  // neighbourhoods outside the market don't appear.
  const sa = options.serviceArea
  const withinService = sa
    ? sql` and (l.source = 'manual' or l.geom && st_makeenvelope(${sa.minLng}, ${sa.minLat}, ${sa.maxLng}, ${sa.maxLat}, 4326))`
    : sql``
  const res = await database.execute(sql`
    select a.id, a.name, a.region, count(l.id)::int as count
    from ${area} a
    join listing l
      on l.organization_id = ${organizationId}
      and l.status = 'active'
      and l.geom is not null
      and st_intersects(a.geom, l.geom)${withinService}
    group by a.id, a.name, a.region
    order by count(l.id) desc, a.name asc
  `)
  return (
    res.rows as Array<{ id: string; name: string; region: string | null; count: number }>
  ).map((r) => ({ id: r.id, name: r.name, region: r.region, count: r.count }))
}

export interface AreaPolygon {
  id: string
  name: string
  geojson: string
}

/** GeoJSON for the given area ids, for drawing selected areas on the map. */
export async function getAreaPolygons(
  database: Database,
  ids: ReadonlyArray<string>,
): Promise<AreaPolygon[]> {
  if (ids.length === 0) return []
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )
  const res = await database.execute(sql`
    select id, name, st_asgeojson(geom) as geojson
    from ${area}
    where id in (${list})
  `)
  return (res.rows as Array<{ id: string; name: string; geojson: string }>).map((r) => ({
    id: r.id,
    name: r.name,
    geojson: r.geojson,
  }))
}
