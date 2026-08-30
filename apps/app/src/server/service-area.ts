import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// Service-area (serviced market) settings for the dashboard. Owner/admin only (serviceArea:manage).
// @realtr/db imports stay dynamic + inside handlers (server-only pg), per the app convention.

async function auth() {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  if (!result.ok) return { ok: false as const, code: "unauthorized" as const }
  if (!can(result.role, "serviceArea", "manage"))
    return { ok: false as const, code: "forbidden" as const }
  return { ok: true as const, authorization: result }
}

// A valid bounding box: finite lat/lng in range, with min strictly less than max on each axis.
const bboxInput = z
  .object({
    minLng: z.number().gte(-180).lte(180),
    minLat: z.number().gte(-90).lte(90),
    maxLng: z.number().gte(-180).lte(180),
    maxLat: z.number().gte(-90).lte(90),
    label: z.string().trim().max(120).optional().default(""),
  })
  .refine((b) => b.minLng < b.maxLng && b.minLat < b.maxLat, {
    message: "Min must be less than max on both axes",
  })

export const getServiceAreaFn = createServerFn({ method: "GET" }).handler(async () => {
  const a = await auth()
  if (!a.ok) return a
  const { db } = await import("@realtr/db")
  const { getServiceArea } = await import("@realtr/db/service-areas")
  const area = await getServiceArea(db, a.authorization.organizationId)
  return { ok: true as const, area }
})

export const saveServiceAreaFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => bboxInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { upsertServiceArea } = await import("@realtr/db/service-areas")
    await upsertServiceArea(db, a.authorization.organizationId, {
      minLng: data.minLng,
      minLat: data.minLat,
      maxLng: data.maxLng,
      maxLat: data.maxLat,
      label: data.label.trim() ? data.label.trim() : null,
    })
    return { ok: true as const }
  })

export const clearServiceAreaFn = createServerFn({ method: "POST" }).handler(async () => {
  const a = await auth()
  if (!a.ok) return a
  const { db } = await import("@realtr/db")
  const { clearServiceArea } = await import("@realtr/db/service-areas")
  await clearServiceArea(db, a.authorization.organizationId)
  return { ok: true as const }
})

/** Count active listings that would show under a candidate box (feed-in-box + all manual). */
export const previewServiceAreaFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => bboxInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { countListings } = await import("@realtr/db/listings")
    const count = await countListings(db, a.authorization.organizationId, {}, { serviceArea: data })
    return { ok: true as const, count }
  })
