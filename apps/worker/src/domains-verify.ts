import { z } from "zod"

export const DOMAINS_VERIFY_QUEUE = "domains.verify"

export const domainsVerifyPayloadSchema = z.object({
  version: z.literal(1),
  domainId: z.string().min(1),
})
export type DomainsVerifyPayload = z.infer<typeof domainsVerifyPayloadSchema>

export interface DomainsVerifyDependencies {
  /** Run verification for one domain (transitions it + persists). */
  verify(domainId: string): Promise<{ state: string }>
  log(message: string): void
}

export async function handleDomainsVerify(
  payload: unknown,
  dependencies: DomainsVerifyDependencies,
): Promise<void> {
  const job = domainsVerifyPayloadSchema.parse(payload)
  const outcome = await dependencies.verify(job.domainId)
  dependencies.log(`${DOMAINS_VERIFY_QUEUE} domain=${job.domainId} state=${outcome.state}`)
}
