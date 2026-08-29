import { db } from "@realtr/db"
import { getSubscriptionByOrg } from "@realtr/db/billing"
import { type Entitlements, type SubscriptionStatus, resolveEntitlements } from "./entitlements"

// The single enforcement seam (M6-A5): resolve an org's current subscription mirror to its capability
// set. Server mutations, the renderer serve path, and lead capture all call this instead of reading
// the mirror or reimplementing the rules. A pre-billing tenant (no mirror row) resolves to permissive
// UNMANAGED, so nothing that predates billing is locked out.
export async function loadEntitlements(organizationId: string): Promise<Entitlements> {
  const sub = await getSubscriptionByOrg(db, organizationId)
  return resolveEntitlements(
    sub ? { planId: sub.planId, status: sub.status as SubscriptionStatus } : null,
  )
}
