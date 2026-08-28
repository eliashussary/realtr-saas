import type { ListingSource } from "@realtr/core"
import { z } from "zod"

export const LISTINGS_SYNC_QUEUE = "listings.sync"
export const listingsSyncPayloadSchema = z.object({
  version: z.literal(1),
  organizationId: z.string().min(1),
  provider: z.string().min(1),
})
export type ListingsSyncPayload = z.infer<typeof listingsSyncPayloadSchema>

export interface ListingsSyncDependencies {
  getSource(provider: string): ListingSource | undefined
  log(message: string): void
}

export async function handleListingsSync(
  payload: unknown,
  dependencies: ListingsSyncDependencies,
): Promise<void> {
  const job = listingsSyncPayloadSchema.parse(payload)
  const source = dependencies.getSource(job.provider)
  if (!source) throw new Error(`Unknown listing source provider: ${job.provider}`)

  // M3-A3 will load and decrypt this org's integration config, pass the last checkpoint as `since`,
  // and persist upserts + reconcile removals against listEntitlement in a transaction.
  const result = await source.sync({ config: {}, organizationId: job.organizationId })
  dependencies.log(
    `${LISTINGS_SYNC_QUEUE} org=${job.organizationId} provider=${job.provider} upserts=${result.upserts.length}`,
  )
}
