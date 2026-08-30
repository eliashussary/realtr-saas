import { type SQL, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { listing, serviceArea } from "./schema"
import type * as schema from "./schema"

type Database = NodePgDatabase<typeof schema>

// [minLng, minLat, maxLng, maxLat] — same order the DDF query builder expects, so it feeds the sync
// pull directly.
export interface ServiceAreaBBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface ServiceAreaRecord extends ServiceAreaBBox {
  label: string | null
}

export async function getServiceArea(
  database: Database,
  organizationId: string,
): Promise<ServiceAreaRecord | null> {
  const [row] = await database
    .select({
      minLng: serviceArea.minLng,
      minLat: serviceArea.minLat,
      maxLng: serviceArea.maxLng,
      maxLat: serviceArea.maxLat,
      label: serviceArea.label,
    })
    .from(serviceArea)
    .where(eq(serviceArea.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

/** Create or replace a tenant's service area (one row per org). */
export async function upsertServiceArea(
  database: Database,
  organizationId: string,
  input: ServiceAreaBBox & { label?: string | null },
): Promise<void> {
  const values = {
    minLng: input.minLng,
    minLat: input.minLat,
    maxLng: input.maxLng,
    maxLat: input.maxLat,
    label: input.label ?? null,
  }
  await database
    .insert(serviceArea)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({
      target: serviceArea.organizationId,
      set: { ...values, updatedAt: new Date() },
    })
}

export async function clearServiceArea(
  database: Database,
  organizationId: string,
): Promise<boolean> {
  const result = await database
    .delete(serviceArea)
    .where(eq(serviceArea.organizationId, organizationId))
  return (result.rowCount ?? 0) > 0
}

/**
 * The public-visibility predicate for a service area: a listing shows if it is the realtor's own
 * manual/exclusive listing (always), or a feed listing whose point falls inside the box. A feed
 * listing with no coordinates can't be placed, so it is excluded. Uses the GiST index on `geom`.
 */
export function serviceAreaCondition(bbox: ServiceAreaBBox): SQL {
  return sql`(${listing.source} = 'manual' or (${listing.geom} is not null and ${listing.geom} && st_makeenvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)))`
}
