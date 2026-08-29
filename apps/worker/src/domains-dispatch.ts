import { z } from "zod"

// Scheduled fan-out: enqueue a verification job for every domain still trying to reach `verified`
// (pending/verifying/error), so a domain whose DNS propagates later flips to verified without a
// manual click.

export const DOMAINS_DISPATCH_QUEUE = "domains.dispatch"

export const domainsDispatchPayloadSchema = z.object({ version: z.literal(1) })

export interface DomainsDispatchDependencies {
  listAwaiting(): Promise<Array<{ id: string }>>
  enqueue(domainId: string): Promise<void>
  log(message: string): void
}

export async function handleDomainsDispatch(
  payload: unknown,
  dependencies: DomainsDispatchDependencies,
): Promise<void> {
  domainsDispatchPayloadSchema.parse(payload)
  const domains = await dependencies.listAwaiting()
  for (const domain of domains) {
    await dependencies.enqueue(domain.id)
  }
  dependencies.log(`${DOMAINS_DISPATCH_QUEUE} dispatched=${domains.length}`)
}
