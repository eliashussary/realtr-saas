import type { ListingSource, NormalizedListing, SourceContext } from "./types"

// DDF (realtor.ca) — first and cheapest source. STUB for now; the real RETS/DDF pull +
// normalizer is ported from the existing single-tenant codebase in a later slice.
export const ddfSource: ListingSource = {
  provider: "ddf",

  async authenticate(_ctx: SourceContext): Promise<void> {
    // TODO: DDF login (RETS/OData) using ctx.config credentials.
  },

  async pull(ctx: SourceContext): Promise<NormalizedListing[]> {
    console.log(`[ddf] pull stub for org ${ctx.organizationId} — no-op until real port`)
    return []
  },
}
