import { z } from "zod"

// Scheduled fan-out: enumerate connected listing-source integrations and enqueue one sync job per
// tenant. Runs on two cadences — frequent incremental deltas and a daily full reconciliation
// (DDF requires refresh at least every 24h + daily master-list reconciliation).

export const LISTINGS_DISPATCH_QUEUE = "listings.dispatch"
export const LISTINGS_DISPATCH_RECONCILE_QUEUE = "listings.dispatch.reconcile"

export const listingsDispatchPayloadSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["incremental", "reconcile"]).default("incremental"),
})
export type ListingsDispatchPayload = z.infer<typeof listingsDispatchPayloadSchema>

export interface ListingsDispatchDependencies {
  listConnected(): Promise<Array<{ organizationId: string; provider: string }>>
  enqueue(job: {
    organizationId: string
    provider: string
    mode: "incremental" | "reconcile"
  }): Promise<void>
  log(message: string): void
}

export async function handleListingsDispatch(
  payload: unknown,
  dependencies: ListingsDispatchDependencies,
): Promise<void> {
  const { mode } = listingsDispatchPayloadSchema.parse(payload)
  const sources = await dependencies.listConnected()
  for (const source of sources) {
    await dependencies.enqueue({ ...source, mode })
  }
  dependencies.log(`${LISTINGS_DISPATCH_QUEUE} mode=${mode} dispatched=${sources.length}`)
}
