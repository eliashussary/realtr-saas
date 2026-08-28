import { and, eq, notInArray, sql } from "drizzle-orm"
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

/** Read a tenant's currently-active listings for public rendering (M3-A6 will build on this). */
export async function listActiveListings(
  database: ListingDatabase,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<Array<{ sourceListingId: string; sourceKey: string; data: Record<string, unknown> }>> {
  const rows = await database
    .select({
      sourceListingId: listing.sourceListingId,
      sourceKey: listing.sourceKey,
      data: listing.data,
    })
    .from(listing)
    .where(and(eq(listing.organizationId, organizationId), eq(listing.status, "active")))
    .orderBy(sql`${listing.sourceModifiedAt} desc nulls last`)
    .limit(options.limit ?? 60)
  return rows
}
