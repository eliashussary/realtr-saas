// Grace→lapse lifecycle (M6-A4, ADR 0008). The one billing transition that no Stripe webhook can
// make: after the payment-failure grace window elapses, a tenant in `past_due` becomes `lapsed`
// (site unpublished by the A5 enforcement flip). Time-based, so a scheduled worker sweep drives it.
// Pure over a repository port (like the domain verification service), so it is unit-tested with no DB.

/**
 * A subscription lapses when it is still in grace and its grace deadline has passed. `status` is the
 * raw mirror value (a plain string, so the db repository's row type satisfies the port directly).
 */
export function shouldLapse(status: string, graceEndsAt: Date | null, now: Date): boolean {
  return status === "past_due" && graceEndsAt != null && graceEndsAt.getTime() <= now.getTime()
}

export interface GraceCandidate {
  organizationId: string
  status: string
  graceEndsAt: Date | null
}

export interface GraceSweepRepository {
  /** Rows worth checking: past_due subscriptions whose grace deadline may have passed. */
  listGraceCandidates(now: Date): Promise<GraceCandidate[]>
  /** Transition an org's subscription to `lapsed` (guarded to past_due, so a concurrent recovery wins). */
  markLapsed(organizationId: string): Promise<void>
}

/**
 * Lapse every subscription whose grace window has elapsed. Re-checks `shouldLapse` in one tested place
 * even though the repository prefilters, so the predicate never drifts between the query and the rule.
 * Returns the orgs that lapsed (for logging / follow-on effects).
 */
export async function runGraceSweep(
  repository: GraceSweepRepository,
  now: Date = new Date(),
): Promise<{ lapsed: string[] }> {
  const candidates = await repository.listGraceCandidates(now)
  const lapsed: string[] = []
  for (const candidate of candidates) {
    if (shouldLapse(candidate.status, candidate.graceEndsAt, now)) {
      await repository.markLapsed(candidate.organizationId)
      lapsed.push(candidate.organizationId)
    }
  }
  return { lapsed }
}
