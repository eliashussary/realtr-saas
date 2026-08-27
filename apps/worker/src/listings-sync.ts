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

  // M3 will load and decrypt this organization's integration config before provider use.
  const listings = await source.pull({ config: {}, organizationId: job.organizationId })
  dependencies.log(
    `${LISTINGS_SYNC_QUEUE} org=${job.organizationId} provider=${job.provider} pulled=${listings.length}`,
  )
}
