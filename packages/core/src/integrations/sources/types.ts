// Listing-source provider interface. Every ingestion source (DDF first; later RESO Web
// API, MLSGrid, Bridge, regional feeds) implements this. New sources are new impls behind
// this interface, not new plumbing.

export interface NormalizedListing {
  sourceListingId: string
  data: Record<string, unknown>
}

export interface SourceContext {
  /** Per-tenant credentials/config (decrypted from integration.config). */
  config: Record<string, unknown>
  /** Owning organization id, for attribution. */
  organizationId: string
}

export interface ListingSource {
  readonly provider: string
  /** Validate credentials / establish a session. Throw on failure. */
  authenticate(ctx: SourceContext): Promise<void>
  /** Fetch and normalize listings from the upstream feed. */
  pull(ctx: SourceContext): Promise<NormalizedListing[]>
}
