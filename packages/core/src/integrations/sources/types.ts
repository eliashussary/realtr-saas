// Listing-source provider interface (v2). Every ingestion source (DDF first; later RESO Web API,
// MLSGrid, Bridge, regional feeds) implements this. New sources are new impls behind this interface,
// not new plumbing.
//
// v2 replaces the toy `pull(): NormalizedListing[]` with the three operations the M3-D1 discovery
// brief showed a real feed needs: a connectivity check, an incremental delta with a resumable
// checkpoint, and a full current-entitlement list for daily master-list reconciliation (records
// absent from a *successful complete* list are removed). Removals therefore come from
// `listEntitlement`, not from `sync`.

export type ListingStatus = "active" | "removed"

export interface NormalizedListing {
  /** Upstream business id (DDF ListingId). */
  sourceListingId: string
  /** Upstream resource key (DDF ListingKey) — the reconciliation/identity key. */
  sourceKey: string
  status: ListingStatus
  /** Upstream last-modified instant (ISO), for delta ordering and freshness. */
  sourceModifiedAt?: string
  /** Normalized display fields (price, address, facts, media, attribution). */
  data: Record<string, unknown>
  /** Optional raw upstream record for diagnostics — retention-gated; never logged. */
  raw?: Record<string, unknown>
}

export interface SourceContext {
  /** Per-tenant credentials/config, decrypted from integration.config. */
  config: Record<string, unknown>
  /** Owning organization id, for attribution and tenant scoping. */
  organizationId: string
  /** Resume watermark from the last successful incremental run (ISO). */
  since?: string
  /** Abort in-flight work on shutdown. */
  signal?: AbortSignal
}

export interface SyncResult {
  /** Records changed since `ctx.since` to upsert. */
  upserts: NormalizedListing[]
  /** New watermark to persist for the next incremental run; omit to leave it unchanged. */
  checkpoint?: string
}

export interface ListingSource {
  readonly provider: string
  /** Validate credentials / connectivity for the connect + test UI. Throw on failure. */
  verify(ctx: SourceContext): Promise<void>
  /** Incremental delta: records changed since `ctx.since`, plus the next checkpoint. */
  sync(ctx: SourceContext): Promise<SyncResult>
  /** Full set of currently-entitled source keys, for daily master-list reconciliation. */
  listEntitlement(ctx: SourceContext): Promise<string[]>
}
