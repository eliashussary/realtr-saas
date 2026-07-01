import { ddfSource } from "./ddf"
import type { ListingSource } from "./types"

/** provider -> listing source. Register new sources here. */
export const sourceRegistry: Record<string, ListingSource> = {
  ddf: ddfSource,
}

export function getSource(provider: string): ListingSource | undefined {
  return sourceRegistry[provider]
}

export type { ListingSource, NormalizedListing, SourceContext } from "./types"
