import { db } from "@realtr/db"
import { type ServiceAreaBBox, getServiceArea } from "@realtr/db/service-areas"

export type { ServiceAreaBBox }

/**
 * The tenant's service-area bounding box for the listing sync, or null if unset. The worker merges it
 * into the DDF source config so a sync pulls only listings inside the market.
 */
export async function loadServiceAreaBbox(organizationId: string): Promise<ServiceAreaBBox | null> {
  const sa = await getServiceArea(db, organizationId)
  return sa ? { minLng: sa.minLng, minLat: sa.minLat, maxLng: sa.maxLng, maxLat: sa.maxLat } : null
}
