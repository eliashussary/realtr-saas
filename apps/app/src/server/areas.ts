import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// Neighbourhood-area curation for the dashboard: which areas the tenant's public site offers, in
// what order. Owner/admin only (area:manage to edit, area:view to read). @realtr/db imports stay
// dynamic + inside handlers (server-only pg), per the app convention.
//
// Curation is bounded by the tenant's SERVICE AREA: the candidate pool is every area whose polygon
// intersects the service-area box (or every area when none is set). A realtor curates the
// neighbourhoods in the market they serve — they can't curate a city they don't work in.

async function auth(action: "view" | "manage") {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  if (!result.ok) return { ok: false as const, code: "unauthorized" as const }
  if (!can(result.role, "area", action)) return { ok: false as const, code: "forbidden" as const }
  return { ok: true as const, authorization: result }
}

export const getAreasFn = createServerFn({ method: "GET" }).handler(async () => {
  const a = await auth("view")
  if (!a.ok) return a
  const { db } = await import("@realtr/db")
  const { listServiceAreaAreas, getOrgAreaRanks } = await import("@realtr/db/areas")
  const { getServiceArea } = await import("@realtr/db/service-areas")

  const orgId = a.authorization.organizationId
  const sa = await getServiceArea(db, orgId)
  const bbox = sa
    ? { minLng: sa.minLng, minLat: sa.minLat, maxLng: sa.maxLng, maxLat: sa.maxLat }
    : undefined
  // Candidate pool = areas within the service area (all areas when no service area). The realtor
  // can curate any of these, ordered/selected however they like.
  const candidates = await listServiceAreaAreas(db, orgId, { serviceArea: bbox })
  const ranks = await getOrgAreaRanks(db, orgId)
  const items = candidates.map((f) => ({
    id: f.id,
    name: f.name,
    region: f.region,
    parentRegion: f.parentRegion,
    count: f.count,
    curated: ranks.has(f.id),
    rank: ranks.get(f.id) ?? null,
  }))
  // Sort: curated (by rank) first, then the rest by count desc, name asc.
  items.sort((x, y) => {
    const xc = x.curated ? 0 : 1
    const yc = y.curated ? 0 : 1
    if (xc !== yc) return xc - yc
    if (xc === 0) return (x.rank ?? 0) - (y.rank ?? 0)
    return y.count - x.count || x.name.localeCompare(y.name)
  })
  return { ok: true as const, items, hasServiceArea: !!sa }
})

export const saveAreasFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ areaIds: z.array(z.string().min(1)) }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth("manage")
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { setOrgAreas, listServiceAreaAreas } = await import("@realtr/db/areas")
    const { getServiceArea } = await import("@realtr/db/service-areas")

    const orgId = a.authorization.organizationId
    // Only allow curating areas within the service area: validate the requested ids against the
    // candidate pool before writing. An id outside the service area is rejected (the FK would also
    // catch a bogus id, but this gives a clean error for the out-of-market case).
    const sa = await getServiceArea(db, orgId)
    const bbox = sa
      ? { minLng: sa.minLng, minLat: sa.minLat, maxLng: sa.maxLng, maxLat: sa.maxLat }
      : undefined
    const candidates = await listServiceAreaAreas(db, orgId, { serviceArea: bbox })
    const allowed = new Set(candidates.map((c) => c.id))
    const outside = data.areaIds.filter((id) => !allowed.has(id))
    if (outside.length > 0) {
      return { ok: false as const, code: "outside_service_area" as const }
    }
    await setOrgAreas(db, orgId, data.areaIds)
    return { ok: true as const }
  })

/** GeoJSON for the given area ids, for the curation map. Any authenticated member can read. */
export const getAreaPolygonsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ areaIds: z.array(z.string().min(1)) }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth("view")
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { getAreaPolygons } = await import("@realtr/db/areas")
    const polys = await getAreaPolygons(db, data.areaIds)
    return { ok: true as const, polygons: polys }
  })
