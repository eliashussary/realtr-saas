// Plan catalog (M6, ADR 0008). Pure data — no DB, no Stripe SDK. Prices are provisional and live
// here so changing them never touches billing logic. Amounts are CAD cents.

export type PlanId = "solo" | "team"

export interface Plan {
  id: PlanId
  name: string
  /** Base monthly price, CAD cents. */
  basePriceCents: number
  /** Members covered by the base price. */
  includedMembers: number
  /** Price per member beyond `includedMembers`, CAD cents. 0 = no additional seats sold. */
  additionalSeatPriceCents: number
  /** Hard member cap. `null` = uncapped (extra seats are billable, not blocked). */
  memberCap: number | null
  /** Custom domains a tenant may attach. */
  customDomains: number
  /** Listing-source / CRM integrations allowed. */
  integrations: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: "solo",
    name: "Solo",
    basePriceCents: 12900,
    includedMembers: 1,
    additionalSeatPriceCents: 0,
    memberCap: 1,
    customDomains: 1,
    integrations: true,
  },
  team: {
    id: "team",
    name: "Team",
    basePriceCents: 29900,
    includedMembers: 5,
    additionalSeatPriceCents: 4900,
    memberCap: null,
    customDomains: 1,
    integrations: true,
  },
}

export function getPlan(id: string): Plan | null {
  return (PLANS as Record<string, Plan>)[id] ?? null
}

/** Billable additional seats for a plan given a member count (0 when within the included count). */
export function billableSeats(plan: Plan, memberCount: number): number {
  if (plan.additionalSeatPriceCents <= 0) return 0
  return Math.max(0, memberCount - plan.includedMembers)
}
