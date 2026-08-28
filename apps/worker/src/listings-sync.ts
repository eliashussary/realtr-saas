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

  const result = await runListingSync({
    organizationId: job.organizationId,
    provider: job.provider,
    source,
    config,
    mode: job.mode,
    repository: dependencies.repository,
  })
  dependencies.log(
    `${LISTINGS_SYNC_QUEUE} org=${job.organizationId} provider=${job.provider} mode=${job.mode} upserts=${result.upserted} removed=${result.removed}`,
  )
}
