import { isUniqueViolation } from "@realtr/db/errors"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// The server-fn serializer rejects `Record<string, unknown>` in a payload, so the stored jsonb filter
// crosses the boundary as this concrete Json type and is cast back to a ListingFilter at the route.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

// Property-collection CRUD for the dashboard. Owner/admin only (collection:manage). @realtr/db imports
// stay dynamic + inside handlers (server-only pg), per the app convention. A collection is a named,
// saved ListingFilter; its page runs that filter, and it can be surfaced as a "popular search".

async function auth() {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  if (!result.ok) return { ok: false as const, code: "unauthorized" as const }
  if (!can(result.role, "collection", "manage"))
    return { ok: false as const, code: "forbidden" as const }
  return { ok: true as const, authorization: result }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "collection"
  )
}

// The saved-search shape — mirrors @realtr/core's ListingFilter. `.strip()` drops anything unknown so
// only real filter keys are persisted.
const filterSchema = z
  .object({
    minPrice: z.number().int().nonnegative().optional(),
    maxPrice: z.number().int().nonnegative().optional(),
    minBeds: z.number().int().nonnegative().optional(),
    minBaths: z.number().int().nonnegative().optional(),
    propertyType: z.array(z.string().trim().min(1)).optional(),
    city: z.array(z.string().trim().min(1)).optional(),
    areaIds: z.array(z.string().trim().min(1)).optional(),
    sort: z.enum(["newest", "price_asc", "price_desc"]).optional(),
  })
  .strip()

const collectionInput = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(1000).optional().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  rank: z.number().int().nullable().optional().default(null),
  filter: filterSchema.default({}),
})

function toRepoInput(data: z.infer<typeof collectionInput>) {
  return {
    slug: data.slug.trim() ? slugify(data.slug) : slugify(data.name),
    name: data.name,
    description: data.description,
    status: data.status,
    rank: data.rank ?? null,
    filter: data.filter as Record<string, unknown>,
  }
}

export interface CollectionListItem {
  id: string
  name: string
  slug: string
  status: string
  rank: number | null
  updatedAt: string
}

export const listCollectionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const a = await auth()
  if (!a.ok) return a
  const { db } = await import("@realtr/db")
  const { listCollectionsForOrg } = await import("@realtr/db/collections")
  const rows = await listCollectionsForOrg(db, a.authorization.organizationId)
  const collections: CollectionListItem[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    rank: c.rank,
    updatedAt: c.updatedAt.toISOString(),
  }))
  return { ok: true as const, collections }
})

export const getCollectionFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ collectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { getCollectionForOrg } = await import("@realtr/db/collections")
    const c = await getCollectionForOrg(db, a.authorization.organizationId, data.collectionId)
    if (!c) return { ok: false as const, code: "not_found" as const }
    return {
      ok: true as const,
      collection: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        status: c.status as "draft" | "published",
        rank: c.rank,
        filter: c.filter as Json,
      },
    }
  })

export const createCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => collectionInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { createCollection } = await import("@realtr/db/collections")
    try {
      const row = await createCollection(db, a.authorization.organizationId, toRepoInput(data))
      return { ok: true as const, id: row.id }
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false as const, code: "slug_taken" as const }
      throw error
    }
  })

const updateInput = collectionInput.extend({ collectionId: z.string().uuid() })

export const updateCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { updateCollection } = await import("@realtr/db/collections")
    try {
      const row = await updateCollection(
        db,
        a.authorization.organizationId,
        data.collectionId,
        toRepoInput(data),
      )
      if (!row) return { ok: false as const, code: "not_found" as const }
      return { ok: true as const }
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false as const, code: "slug_taken" as const }
      throw error
    }
  })

export const deleteCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ collectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { deleteCollection } = await import("@realtr/db/collections")
    const removed = await deleteCollection(db, a.authorization.organizationId, data.collectionId)
    return removed ? { ok: true as const } : { ok: false as const, code: "not_found" as const }
  })

/** Live match count for a filter, so the editor shows how many listings a saved search returns. */
export const previewCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => filterSchema.parse(input))
  .handler(async ({ data }) => {
    const a = await auth()
    if (!a.ok) return a
    const { db } = await import("@realtr/db")
    const { countListings } = await import("@realtr/db/listings")
    const count = await countListings(db, a.authorization.organizationId, data)
    return { ok: true as const, count }
  })
