import { z } from "zod"

// Scheduled grace→lapse sweep (M6-A4). The one billing transition Stripe webhooks can't make: after
// the payment-failure grace window elapses, move a `past_due` tenant to `lapsed`. Dependency-injected
// (like domains-dispatch) so the handler is unit-tested with no DB and no @realtr/core db singleton.

export const BILLING_SWEEP_QUEUE = "billing.sweep"

export const billingSweepPayloadSchema = z.object({ version: z.literal(1) })

export interface BillingSweepDependencies {
  sweep(): Promise<{ lapsed: string[] }>
  log(message: string): void
}

export async function handleBillingSweep(
  payload: unknown,
  dependencies: BillingSweepDependencies,
): Promise<void> {
  billingSweepPayloadSchema.parse(payload)
  const { lapsed } = await dependencies.sweep()
  dependencies.log(`${BILLING_SWEEP_QUEUE} lapsed=${lapsed.length}`)
}
