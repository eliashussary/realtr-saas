import { type SQL, and, eq, gte, ilike, inArray, notInArray, or, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { listing, listingSyncRun, listingSyncState } from "./schema"

export type ListingDatabase = NodePgDatabase<typeof schema>

// Structural mirrors of @realtr/core's sync port types. Defined locally so this leaf package does
// not depend on @realtr/core (which depends on @realtr/db). The worker passes this repository to
// `runListingSync`; TS checks structural compatibility at the call site.
export interface ListingUpsertInput {
  sourceListingId: string
  sourceKey: string
  status: "active" | "removed"
  sourceModifiedAt?: string
  data: Record<string, unknown>
}

export interface ListingSyncRunInput {
  organizationId: string
  provider: string
  mode: "incremental" | "reconcile"
  status: "succeeded" | "failed"
  fetched: number
  upserted: number
  removed: number
  checkpoint?: string
  error?: string
  startedAt: string
  finishedAt: string
}

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The MVP (tenant-copy) listing repository implementing the sync engine's port. Listings are keyed
 * per tenant by (org, source, sourceListingId); reconciliation and dedup use `sourceKey`.
 */
export function createListingRepository(database: ListingDatabase) {
  return {
    async getCheckpoint(organizationId: string, provider: string): Promise<string | undefined> {
      const [row] = await database
        .select({ checkpoint: listingSyncState.checkpoint })
        .from(listingSyncState)
        .where(
          and(
            eq(listingSyncState.organizationId, organizationId),
            eq(listingSyncState.provider, provider),
          ),
        )
        .limit(1)
      return row?.checkpoint ?? undefined
    },

    async upsertListings(
      organizationId: string,
      provider: string,
      listings: ReadonlyArray<ListingUpsertInput>,
    ): Promise<number> {
      if (listings.length === 0) return 0
      const now = new Date()
      await database.transaction(async (tx) => {
        for (const item of listings) {
          await tx
            .insert(listing)
            .values({
              organizationId,
              source: provider,
              sourceListingId: item.sourceListingId,
              sourceKey: item.sourceKey,
              status: "active",
              sourceModifiedAt: toDate(item.sourceModifiedAt),
              lastSeenAt: now,
              data: item.data,
            })
            .onConflictDoUpdate({
              target: [listing.organizationId, listing.source, listing.sourceListingId],
              set: {
                sourceKey: item.sourceKey,
                status: "active",
                sourceModifiedAt: toDate(item.sourceModifiedAt),
                lastSeenAt: now,
                data: item.data,
                updatedAt: now,
              },
            })
        }
      })
      return listings.length
    },

    async markRemovedNotIn(
      organizationId: string,
      provider: string,
      activeKeys: string[],
    ): Promise<number> {
      const now = new Date()
      const scope = and(
        eq(listing.organizationId, organizationId),
        eq(listing.source, provider),
        eq(listing.status, "active"),
      )
      const where =
        activeKeys.length === 0 ? scope : and(scope, notInArray(listing.sourceKey, activeKeys))
      const result = await database
        .update(listing)
        .set({ status: "removed", updatedAt: now })
        .where(where)
      return result.rowCount ?? 0
    },

    async recordRun(run: ListingSyncRunInput): Promise<void> {
      await database.transaction(async (tx) => {
        await tx.insert(listingSyncRun).values({
          organizationId: run.organizationId,
          provider: run.provider,
          mode: run.mode,
          status: run.status,
          fetched: run.fetched,
          upserted: run.upserted,
          removed: run.removed,
          checkpoint: run.checkpoint ?? null,
          error: run.error ?? null,
          startedAt: new Date(run.startedAt),
          finishedAt: new Date(run.finishedAt),
        })

        if (run.status !== "succeeded") return
        const patch =
          run.mode === "incremental"
            ? run.checkpoint
              ? { checkpoint: run.checkpoint, updatedAt: new Date() }
              : null
            : { lastReconciledAt: new Date(run.finishedAt), updatedAt: new Date() }
        if (!patch) return

        await tx
          .insert(listingSyncState)
          .values({ organizationId: run.organizationId, provider: run.provider, ...patch })
          .onConflictDoUpdate({
            target: [listingSyncState.organizationId, listingSyncState.provider],
            set: patch,
          })
      })
    },
  }
}

export type ListingRepository = ReturnType<typeof createListingRepository>

export interface ActiveListingRow {
  source: string
  sourceListingId: string
  sourceKey: string
  data: Record<string, unknown>
}

// Featured (tenant-curated) first, then by upstream recency. Applied to the public grid so pinned
// properties lead, and reused by the featured-only query below.
const publicOrder = sql`${listing.featured} desc, ${listing.featuredRank} asc nulls last, ${listing.sourceModifiedAt} desc nulls last`

/** Read a tenant's currently-active listings for public rendering (featured first). */
export async function listActiveListings(
  database: ListingDatabase,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<ActiveListingRow[]> {
  return database
    .select({
      source: listing.source,
      sourceListingId: listing.sourceListingId,
      sourceKey: listing.sourceKey,
      data: listing.data,
    })
    .from(listing)
    .where(and(eq(listing.organizationId, organizationId), eq(listing.status, "active")))
    .orderBy(publicOrder)
    .limit(options.limit ?? 60)
}

/**
 * Read a tenant's featured, active listings for a "featured" surface (e.g. the homepage block).
 * Falls back to nothing when the realtor has featured none — the caller decides whether to backfill.
 */
export async function listFeaturedListings(
  database: ListingDatabase,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<ActiveListingRow[]> {
  return database
    .select({
      source: listing.source,
      sourceListingId: listing.sourceListingId,
      sourceKey: listing.sourceKey,
      data: listing.data,
    })
    .from(listing)
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.status, "active"),
        eq(listing.featured, true),
      ),
    )
    .orderBy(
      sql`${listing.featuredRank} asc nulls last, ${listing.sourceModifiedAt} desc nulls last`,
    )
    .limit(options.limit ?? 12)
}

// ---------------------------------------------------------------------------
// Public faceted search — filters/sorts/counts a tenant's active listings on the
// generated facet columns. The filter shape mirrors @realtr/core's ListingFilter (defined locally so
// this leaf package keeps no @realtr/core dependency; the caller passes a structurally-equal value).
// ---------------------------------------------------------------------------

export type ListingSortInput = "newest" | "price_asc" | "price_desc"

export interface ListingFilterInput {
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  minBaths?: number
  propertyType?: string[]
  city?: string[]
  areaIds?: string[] // neighbourhood polygons — wired to a PostGIS join in the areas slice
  sort?: ListingSortInput
}

/** Build the SQL predicates for a filter's narrowing dimensions (not org/status — the caller adds those). */
export function buildListingFilterConditions(filter: ListingFilterInput): SQL[] {
  const conditions: SQL[] = []
  // list_price is numeric; compare against a numeric literal to keep the index usable.
  if (typeof filter.minPrice === "number") {
    conditions.push(sql`${listing.listPrice} >= ${filter.minPrice}`)
  }
  if (typeof filter.maxPrice === "number") {
    conditions.push(sql`${listing.listPrice} <= ${filter.maxPrice}`)
  }
  if (typeof filter.minBeds === "number") conditions.push(gte(listing.bedrooms, filter.minBeds))
  if (typeof filter.minBaths === "number") conditions.push(gte(listing.bathrooms, filter.minBaths))
  if (filter.propertyType?.length)
    conditions.push(inArray(listing.propertyType, filter.propertyType))
  if (filter.city?.length) conditions.push(inArray(listing.city, filter.city))
  return conditions
}

function activeScope(organizationId: string, filter: ListingFilterInput): SQL {
  const where = and(
    eq(listing.organizationId, organizationId),
    eq(listing.status, "active"),
    ...buildListingFilterConditions(filter),
  )
  // `and` only returns undefined for an empty list; the two fixed predicates guarantee a value.
  return where as SQL
}

function listingOrder(sort: ListingSortInput | undefined): SQL {
  if (sort === "price_asc") return sql`${listing.listPrice} asc nulls last`
  if (sort === "price_desc") return sql`${listing.listPrice} desc nulls last`
  if (sort === "newest") return sql`${listing.sourceModifiedAt} desc nulls last`
  // Default: featured curation first, then upstream recency (matches the public grid order).
  return publicOrder
}

/** Filtered page of a tenant's active listings for the public search. */
export async function searchListings(
  database: ListingDatabase,
  organizationId: string,
  filter: ListingFilterInput,
  options: { limit?: number; offset?: number } = {},
): Promise<ActiveListingRow[]> {
  return database
    .select({
      source: listing.source,
      sourceListingId: listing.sourceListingId,
      sourceKey: listing.sourceKey,
      data: listing.data,
    })
    .from(listing)
    .where(activeScope(organizationId, filter))
    .orderBy(listingOrder(filter.sort))
    .limit(options.limit ?? 25)
    .offset(options.offset ?? 0)
}

/** Total matches for a filter (for pagination + the results count). */
export async function countListings(
  database: ListingDatabase,
  organizationId: string,
  filter: ListingFilterInput,
): Promise<number> {
  const [row] = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(listing)
    .where(activeScope(organizationId, filter))
  return row?.value ?? 0
}

export interface ListingFacet {
  value: string
  count: number
}

export interface ListingFacets {
  propertyTypes: ListingFacet[]
  cities: ListingFacet[]
}

/**
 * Available property-type and city facets (with counts) across a tenant's active listings, so the
 * filter UI can offer only values that exist. Counts are over the full active set (not the current
 * selection) — a stable menu the user filters down from.
 */
export async function listingFacets(
  database: ListingDatabase,
  organizationId: string,
): Promise<ListingFacets> {
  const base = and(eq(listing.organizationId, organizationId), eq(listing.status, "active")) as SQL
  const [types, cities] = await Promise.all([
    database
      .select({ value: listing.propertyType, count: sql<number>`count(*)::int` })
      .from(listing)
      .where(and(base, sql`${listing.propertyType} is not null`))
      .groupBy(listing.propertyType)
      .orderBy(sql`count(*) desc`),
    database
      .select({ value: listing.city, count: sql<number>`count(*)::int` })
      .from(listing)
      .where(and(base, sql`${listing.city} is not null`))
      .groupBy(listing.city)
      .orderBy(sql`count(*) desc`),
  ])
  const clean = (rows: { value: string | null; count: number }[]): ListingFacet[] =>
    rows.filter((r): r is ListingFacet => r.value !== null)
  return { propertyTypes: clean(types), cities: clean(cities) }
}

export interface ListingBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** Bounding box of the filtered set, for fitting the map. Null when no match has coordinates. */
export async function listingBounds(
  database: ListingDatabase,
  organizationId: string,
  filter: ListingFilterInput,
): Promise<ListingBounds | null> {
  const [row] = await database
    .select({
      minLng: sql<number | null>`min(${listing.longitude})`,
      minLat: sql<number | null>`min(${listing.latitude})`,
      maxLng: sql<number | null>`max(${listing.longitude})`,
      maxLat: sql<number | null>`max(${listing.latitude})`,
    })
    .from(listing)
    .where(activeScope(organizationId, filter))
  if (!row || row.minLng === null || row.minLat === null) return null
  return {
    minLng: row.minLng,
    minLat: row.minLat,
    maxLng: row.maxLng as number,
    maxLat: row.maxLat as number,
  }
}

export interface ListingMarker {
  sourceListingId: string
  latitude: number
  longitude: number
  listPrice: number | null
}

/** Lightweight markers (id + point + price) for every filtered listing with coordinates. */
export async function listingMapMarkers(
  database: ListingDatabase,
  organizationId: string,
  filter: ListingFilterInput,
  options: { limit?: number } = {},
): Promise<ListingMarker[]> {
  const rows = await database
    .select({
      sourceListingId: listing.sourceListingId,
      latitude: listing.latitude,
      longitude: listing.longitude,
      listPrice: listing.listPrice,
    })
    .from(listing)
    .where(and(activeScope(organizationId, filter), sql`${listing.latitude} is not null`))
    .limit(options.limit ?? 1000)
  return rows.map((r) => ({
    sourceListingId: r.sourceListingId,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    listPrice: r.listPrice === null ? null : Number(r.listPrice),
  }))
}

export interface ManagementListingRow {
  id: string
  source: string
  status: string
  featured: boolean
  featuredRank: number | null
  memberId: string | null
  sourceListingId: string
  sourceModifiedAt: string | null
  data: Record<string, unknown>
}

/**
 * Read listings for the dashboard management table — includes removed rows and every source, with
 * optional status/source filters and an address/city text search. Tenant-scoped by argument.
 */
export async function listListingsForOrg(
  database: ListingDatabase,
  organizationId: string,
  options: { status?: string; source?: string; search?: string; limit?: number } = {},
): Promise<ManagementListingRow[]> {
  const conditions = [eq(listing.organizationId, organizationId)]
  if (options.status) conditions.push(eq(listing.status, options.status))
  if (options.source) conditions.push(eq(listing.source, options.source))
  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`
    const match = or(
      ilike(sql`${listing.data} #>> '{address,unparsed}'`, term),
      ilike(sql`${listing.data} #>> '{address,city}'`, term),
    )
    if (match) conditions.push(match)
  }
  const rows = await database
    .select({
      id: listing.id,
      source: listing.source,
      status: listing.status,
      featured: listing.featured,
      featuredRank: listing.featuredRank,
      memberId: listing.memberId,
      sourceListingId: listing.sourceListingId,
      sourceModifiedAt: listing.sourceModifiedAt,
      data: listing.data,
    })
    .from(listing)
    .where(and(...conditions))
    // Active first, then featured, then recency — the most useful management order.
    .orderBy(sql`(${listing.status} = 'active') desc, ${publicOrder}`)
    .limit(options.limit ?? 500)
  return rows.map((r) => ({
    ...r,
    sourceModifiedAt: r.sourceModifiedAt ? r.sourceModifiedAt.toISOString() : null,
  }))
}

/**
 * Toggle a listing's featured curation. Tenant-scoped by (org, id). Clearing featured also clears
 * the rank so an un-featured row never keeps a stale position.
 */
export async function setListingFeatured(
  database: ListingDatabase,
  organizationId: string,
  listingId: string,
  featured: boolean,
  rank?: number | null,
): Promise<number> {
  const result = await database
    .update(listing)
    .set({
      featured,
      featuredRank: featured ? (rank ?? null) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(listing.organizationId, organizationId), eq(listing.id, listingId)))
  return result.rowCount ?? 0
}

// ── Manual / exclusive listings ─────────────────────────────────────────────────────────────────
// Exclusive listings are the realtor's own inventory, stored in the same table with source="manual".
// DDF reconciliation never touches them (markRemovedNotIn is scoped by source), so the realtor fully
// owns their lifecycle. Their `data` uses the same shape as normalized DDF data so the renderer's
// view-model renders them unchanged.
export const MANUAL_SOURCE = "manual"

export interface ManualListingInput {
  sourceListingId: string
  sourceKey: string
  memberId?: string | null
  data: Record<string, unknown>
}

export async function createManualListing(
  database: ListingDatabase,
  organizationId: string,
  input: ManualListingInput,
): Promise<string> {
  const [row] = await database
    .insert(listing)
    .values({
      organizationId,
      memberId: input.memberId ?? null,
      source: MANUAL_SOURCE,
      sourceListingId: input.sourceListingId,
      sourceKey: input.sourceKey,
      status: "active",
      data: input.data,
    })
    .returning({ id: listing.id })
  if (!row) throw new Error("Failed to create manual listing")
  return row.id
}

/** Update an exclusive listing's data. Scoped to source="manual" so DDF rows can't be edited. */
export async function updateManualListing(
  database: ListingDatabase,
  organizationId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<number> {
  const result = await database
    .update(listing)
    .set({ data, updatedAt: new Date() })
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.id, id),
        eq(listing.source, MANUAL_SOURCE),
      ),
    )
  return result.rowCount ?? 0
}

/** Hard-delete an exclusive listing (the realtor owns it). Scoped to source="manual". */
export async function deleteManualListing(
  database: ListingDatabase,
  organizationId: string,
  id: string,
): Promise<number> {
  const result = await database
    .delete(listing)
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.id, id),
        eq(listing.source, MANUAL_SOURCE),
      ),
    )
  return result.rowCount ?? 0
}

/** Read one listing by tenant-local id (any source/status), for the management/edit views. */
export async function getListingById(
  database: ListingDatabase,
  organizationId: string,
  id: string,
): Promise<{
  id: string
  source: string
  status: string
  memberId: string | null
  data: Record<string, unknown>
} | null> {
  const [row] = await database
    .select({
      id: listing.id,
      source: listing.source,
      status: listing.status,
      memberId: listing.memberId,
      data: listing.data,
    })
    .from(listing)
    .where(and(eq(listing.organizationId, organizationId), eq(listing.id, id)))
    .limit(1)
  return row ?? null
}

/**
 * Resolve a public `sourceListingId` to its canonical row id and owning agent, tenant-scoped. Used
 * by lead capture to link a listing inquiry to the listing and auto-route it to the listing's agent.
 */
export async function resolveListingRef(
  database: ListingDatabase,
  organizationId: string,
  sourceListingId: string,
): Promise<{ id: string; memberId: string | null } | null> {
  const [row] = await database
    .select({ id: listing.id, memberId: listing.memberId })
    .from(listing)
    .where(
      and(eq(listing.organizationId, organizationId), eq(listing.sourceListingId, sourceListingId)),
    )
    .limit(1)
  return row ?? null
}

/** Read one currently-active listing by its tenant-local id, or null. */
export async function getActiveListing(
  database: ListingDatabase,
  organizationId: string,
  sourceListingId: string,
): Promise<ActiveListingRow | null> {
  const [row] = await database
    .select({
      source: listing.source,
      sourceListingId: listing.sourceListingId,
      sourceKey: listing.sourceKey,
      data: listing.data,
    })
    .from(listing)
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.sourceListingId, sourceListingId),
        eq(listing.status, "active"),
      ),
    )
    .limit(1)
  return row ?? null
}
