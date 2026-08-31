import { and, inArray, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { area, orgArea } from "./schema"
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
  region?: string | null // immediate parent key (e.g. city "ajax")
  parentRegion?: string | null // group key (e.g. "durham-region", "toronto")
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
      const base = {
        name: f.name,
        kind: f.kind ?? "neighbourhood",
        region: f.region ?? null,
        parentRegion: f.parentRegion ?? null,
        sourceId: f.sourceId ?? null,
        sourceName: f.sourceName ?? null,
        // Coerce Polygon → MultiPolygon so mixed inputs fit the MultiPolygon column.
        geom: sql`st_multi(st_setsrid(st_geomfromgeojson(${geojson}), 4326))`,
      }
      await tx
        .insert(area)
        .values({
          id: f.id,
          ...base,
          // Coerce Polygon → MultiPolygon so mixed inputs fit the MultiPolygon column.
          geom: sql`st_multi(st_setsrid(st_geomfromgeojson(${geojson}), 4326))`,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: area.id,
          set: {
            ...base,
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
  parentRegion: string | null
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
    select a.id, a.name, a.region, a.parent_region, count(l.id)::int as count
    from ${area} a
    join listing l
      on l.organization_id = ${organizationId}
      and l.status = 'active'
      and l.geom is not null
      and st_intersects(a.geom, l.geom)${withinService}
    group by a.id, a.name, a.region, a.parent_region
    order by count(l.id) desc, a.name asc
  `)
  const rows = res.rows as Array<{
    id: string
    name: string
    region: string | null
    parent_region: string | null
    count: number
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    parentRegion: r.parent_region,
    count: r.count,
  }))
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

// ---------------------------------------------------------------------------
// Tenant curation (org_area). The filter MENU a realtor offers on their public site — which
// neighbourhood areas, in what order. Curation narrows the filter menu only; search still uses
// full polygons (an uncurated area's listings still show). A tenant with no curated areas falls
// back to "all areas containing their active listings" (listAreaFacets) so a fresh tenant isn't
// stuck with an empty filter.
// ---------------------------------------------------------------------------

/** A curated area: identity + hierarchy keys, curation order, and a live listing count. */
export interface CuratedArea {
  id: string
  name: string
  region: string | null
  parentRegion: string | null
  rank: number | null
  count: number
}

/**
 * The tenant's curated areas (rank-ordered, with live listing counts + group keys) for the filter.
 * Empty curation → falls back to listAreaFacets (in-stock neighbourhoods), rank=null.
 */
export async function listCuratedAreas(
  database: Database,
  organizationId: string,
  options: { serviceArea?: ServiceAreaBBox } = {},
): Promise<CuratedArea[]> {
  const sa = options.serviceArea
  const withinService = sa
    ? sql` and (l.source = 'manual' or l.geom && st_makeenvelope(${sa.minLng}, ${sa.minLat}, ${sa.maxLng}, ${sa.maxLat}, 4326))`
    : sql``
  const res = await database.execute(sql`
    select a.id, a.name, a.region, a.parent_region, o.rank,
           count(l.id) filter (where l.id is not null)::int as count
    from ${orgArea} o
    join ${area} a on a.id = o.area_id
    left join listing l
      on l.organization_id = ${organizationId}
      and l.status = 'active'
      and l.geom is not null
      and st_intersects(a.geom, l.geom)${withinService}
    where o.organization_id = ${organizationId}
    group by a.id, a.name, a.region, a.parent_region, o.rank
    order by o.rank asc nulls last, a.name asc
  `)
  const rows = res.rows as Array<{
    id: string
    name: string
    region: string | null
    parent_region: string | null
    rank: number | null
    count: number
  }>
  if (rows.length === 0) {
    const fallback = await listAreaFacets(database, organizationId, options)
    return fallback.map((f) => ({ ...f, rank: null }))
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    parentRegion: r.parent_region,
    rank: r.rank,
    count: r.count,
  }))
}

/**
 * Replace a tenant's curation with exactly these area ids, assigning rank 0..n-1 in the given order.
 * Idempotent: passing the current set again is a no-op re-rank. Scoped by organizationId; area ids
 * are validated against the global area table by the FK. Empty array clears all curation.
 */
export async function setOrgAreas(
  database: Database,
  organizationId: string,
  areaIds: ReadonlyArray<string>,
): Promise<number> {
  const now = new Date()
  await database.transaction(async (tx) => {
    await tx.delete(orgArea).where(sql`${orgArea.organizationId} = ${organizationId}`)
    if (areaIds.length === 0) return
    for (let i = 0; i < areaIds.length; i++) {
      const areaId = areaIds[i] as string
      await tx
        .insert(orgArea)
        .values({ organizationId, areaId, rank: i, createdAt: now, updatedAt: now })
    }
  })
  return areaIds.length
}

/** Remove specific areas from a tenant's curation. Scoped by organizationId. */
export async function removeOrgAreas(
  database: Database,
  organizationId: string,
  areaIds: ReadonlyArray<string>,
): Promise<number> {
  if (areaIds.length === 0) return 0
  const result = await database
    .delete(orgArea)
    .where(
      and(sql`${orgArea.organizationId} = ${organizationId}`, inArray(orgArea.areaId, areaIds)),
    )
  return result.rowCount ?? 0
}

/**
 * The set of areas a tenant CAN curate: every area whose polygon intersects their service area
 * (if one is set), or every area when no service area is configured. Each carries a live count of
 * the tenant's active listings inside it. This is the curation candidate pool — a realtor can
 * curate any neighbourhood in the market they serve, not just ones with in-stock listings.
 */
export async function listServiceAreaAreas(
  database: Database,
  organizationId: string,
  options: { serviceArea?: ServiceAreaBBox } = {},
): Promise<AreaFacet[]> {
  const sa = options.serviceArea
  // Bound the candidate AREAS to the service area (a WHERE clause, not the listing join — a left
  // join keeps every area regardless). An area is a candidate if any part of it falls inside the
  // box. When no service area is set, all areas are candidates.
  const whereMarket = sa
    ? sql` where st_intersects(a.geom, st_makeenvelope(${sa.minLng}, ${sa.minLat}, ${sa.maxLng}, ${sa.maxLat}, 4326))`
    : sql``
  const res = await database.execute(sql`
    select a.id, a.name, a.region, a.parent_region,
           count(l.id) filter (where l.id is not null)::int as count
    from ${area} a
    left join listing l
      on l.organization_id = ${organizationId}
      and l.status = 'active'
      and l.geom is not null
      and st_intersects(a.geom, l.geom)
    ${whereMarket}
    group by a.id, a.name, a.region, a.parent_region
    order by a.name asc
  `)
  const rows = res.rows as Array<{
    id: string
    name: string
    region: string | null
    parent_region: string | null
    count: number
  }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    parentRegion: r.parent_region,
    count: r.count,
  }))
}

/**
 * The set of area ids a tenant has curated (id → rank), for the dashboard curation UI. Returns an
 * empty map when nothing is curated. Scoped by organizationId.
 */
export async function getOrgAreaRanks(
  database: Database,
  organizationId: string,
): Promise<Map<string, number | null>> {
  const rows = await database
    .select({ areaId: orgArea.areaId, rank: orgArea.rank })
    .from(orgArea)
    .where(sql`${orgArea.organizationId} = ${organizationId}`)
  return new Map(rows.map((r) => [r.areaId, r.rank]))
}
