import type { ListingSource, ListingSyncRepository } from "@realtr/core"
import { runListingSync } from "@realtr/core/sync"
import { z } from "zod"

export const LISTINGS_SYNC_QUEUE = "listings.sync"
export const listingsSyncPayloadSchema = z.object({
  version: z.literal(1),
  organizationId: z.string().min(1),
  provider: z.string().min(1),
  mode: z.enum(["incremental", "reconcile"]).default("incremental"),
})
export type ListingsSyncPayload = z.infer<typeof listingsSyncPayloadSchema>

export interface ListingsSyncDependencies {
  getSource(provider: string): ListingSource | undefined
  /** Decrypted per-tenant config for (org, provider), or null if not connected. */
  loadConfig(organizationId: string, provider: string): Promise<Record<string, unknown> | null>
  /** The tenant's service-area bounding box, if configured — bounds what the sync pulls. */
  loadServiceAreaBbox(
    organizationId: string,
  ): Promise<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>
  repository: ListingSyncRepository
  log(message: string): void
}

export async function handleListingsSync(
  payload: unknown,
  dependencies: ListingsSyncDependencies,
): Promise<void> {
  const job = listingsSyncPayloadSchema.parse(payload)
  const source = dependencies.getSource(job.provider)
  if (!source) throw new Error(`Unknown listing source provider: ${job.provider}`)

  const config = await dependencies.loadConfig(job.organizationId, job.provider)
  if (!config) {
    throw new Error(
      `No connected ${job.provider} integration for organization ${job.organizationId}`,
    )
  }

  // A configured service area bounds the pull (the DDF source reads config.bbox as [minLng, minLat,
  // maxLng, maxLat]). It takes precedence over any bbox in the stored integration config.
  const serviceArea = await dependencies.loadServiceAreaBbox(job.organizationId)
  const effectiveConfig = serviceArea
    ? {
        ...config,
        bbox: [serviceArea.minLng, serviceArea.minLat, serviceArea.maxLng, serviceArea.maxLat],
      }
    : config

  const result = await runListingSync({
    organizationId: job.organizationId,
    provider: job.provider,
    source,
    config: effectiveConfig,
    mode: job.mode,
    repository: dependencies.repository,
  })
  dependencies.log(
    `${LISTINGS_SYNC_QUEUE} org=${job.organizationId} provider=${job.provider} mode=${job.mode} upserts=${result.upserted} removed=${result.removed}`,
  )
}
