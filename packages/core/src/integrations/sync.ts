import type { ListingSource, NormalizedListing } from "./sources/types"

// Listing sync engine. Orchestrates a source's incremental delta and its full master-list
// reconciliation over a *repository port* — it never touches tables directly. This is a deliberate
// seam (ADR 0006): the MVP repository stores tenant-owned copies keyed per credential, but a future
// Technology-Provider repository can store one deduped canonical property (keyed by `sourceKey` =
// DDF ListingKey) with per-destination entitlement, and this engine is unchanged. Removals are
// always driven by membership in a *successful complete* master list, never by a delta alone.

export type SyncMode = "incremental" | "reconcile"

export interface ListingSyncRunResult {
  organizationId: string
  provider: string
  mode: SyncMode
  status: "succeeded" | "failed"
  fetched: number
  upserted: number
  removed: number
  /** New incremental watermark; only set on a succeeded incremental run. */
  checkpoint?: string
  error?: string
  startedAt: string
  finishedAt: string
}

export interface ListingSyncRepository {
  /** Last incremental checkpoint (ISO) for (org, provider), if any. */
  getCheckpoint(organizationId: string, provider: string): Promise<string | undefined>
  /** Upsert normalized listings (active, lastSeen=now) for a tenant. Returns rows written. */
  upsertListings(
    organizationId: string,
    provider: string,
    listings: NormalizedListing[],
  ): Promise<number>
  /** Mark listings whose `sourceKey` is not in `activeKeys` as removed. Returns rows removed. */
  markRemovedNotIn(organizationId: string, provider: string, activeKeys: string[]): Promise<number>
  /** Persist a completed run; advance the checkpoint only for a succeeded incremental run. */
  recordRun(run: ListingSyncRunResult): Promise<void>
}

export interface RunListingSyncInput {
  organizationId: string
  provider: string
  source: ListingSource
  /** Decrypted per-tenant integration config (credentials). */
  config: Record<string, unknown>
  mode: SyncMode
  repository: ListingSyncRepository
  now?: () => Date
  /** Widen the delta window by re-fetching this far before the stored checkpoint. */
  overlapMs?: number
  /** Allow a reconcile to remove *all* listings when the master list is legitimately empty. */
  allowEmptyEntitlement?: boolean
  signal?: AbortSignal
}

const DEFAULT_OVERLAP_MS = 5 * 60_000

function applyOverlap(checkpoint: string | undefined, overlapMs: number): string | undefined {
  if (!checkpoint) return undefined
  const parsed = Date.parse(checkpoint)
  if (Number.isNaN(parsed)) return checkpoint
  return new Date(parsed - overlapMs).toISOString()
}

/**
 * Run one sync for a tenant + provider. `incremental` upserts records changed since the (overlapped)
 * checkpoint and advances it; `reconcile` removes listings absent from the full entitlement master
 * list. On any failure the run is recorded as failed, the checkpoint is left untouched, no removals
 * occur, and the error is rethrown so the worker/pg-boss can retry.
 */
export async function runListingSync(input: RunListingSyncInput): Promise<ListingSyncRunResult> {
  const { organizationId, provider, source, config, mode, repository, signal } = input
  const now = input.now ?? (() => new Date())
  const startedAt = now().toISOString()

  let fetched = 0
  let upserted = 0
  let removed = 0
  let checkpoint: string | undefined

  try {
    if (mode === "incremental") {
      const stored = await repository.getCheckpoint(organizationId, provider)
      const since = applyOverlap(stored, input.overlapMs ?? DEFAULT_OVERLAP_MS)
      const result = await source.sync({ config, organizationId, since, signal })
      fetched = result.upserts.length
      upserted = await repository.upsertListings(organizationId, provider, result.upserts)
      checkpoint = result.checkpoint ?? stored
    } else {
      const activeKeys = await source.listEntitlement({ config, organizationId, signal })
      fetched = activeKeys.length
      // Safety valve: a completed-but-empty master list would remove every listing. Only do that
      // when explicitly allowed; otherwise skip removal and let an operator investigate.
      if (activeKeys.length > 0 || input.allowEmptyEntitlement) {
        removed = await repository.markRemovedNotIn(organizationId, provider, activeKeys)
      }
    }

    const run: ListingSyncRunResult = {
      organizationId,
      provider,
      mode,
      status: "succeeded",
      fetched,
      upserted,
      removed,
      checkpoint,
      startedAt,
      finishedAt: now().toISOString(),
    }
    await repository.recordRun(run)
    return run
  } catch (error) {
    const run: ListingSyncRunResult = {
      organizationId,
      provider,
      mode,
      status: "failed",
      fetched,
      upserted,
      removed,
      // checkpoint intentionally omitted so a failed run never advances the watermark.
      error: error instanceof Error ? error.message : "unknown sync error",
      startedAt,
      finishedAt: now().toISOString(),
    }
    await repository.recordRun(run)
    throw error
  }
}
