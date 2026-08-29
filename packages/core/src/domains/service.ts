import { type DomainState, afterVerification, canTransition, isDomainState } from "./state-machine"
import { type DnsResolver, verifyDomain } from "./verify"

// Verification service: run a DNS check for a domain and persist the resulting lifecycle state. Kept
// over a repository port (like the listing sync engine) so it is unit-testable with no DB, and so a
// background job or a "verify now" server function can share one implementation.

export interface DomainRecord {
  id: string
  hostname: string
  /** Raw status column; narrowed to a DomainState by the service. */
  status: string
  verificationToken: string
}

export interface DomainRepository {
  getDomain(domainId: string): Promise<DomainRecord | null>
  setStatus(domainId: string, status: DomainState): Promise<void>
}

export interface RunDomainVerificationInput {
  domainId: string
  /** The host custom domains should CNAME to (e.g. sites.realtr.app). */
  expectedCnameTarget: string
  resolver: DnsResolver
  repository: DomainRepository
}

export interface DomainVerificationOutcome {
  ok: boolean
  state: DomainState
  ownership: boolean
  pointing: boolean
  reason?: string
}

export class DomainNotFoundError extends Error {}

/**
 * Verify a domain and transition it: `-> verifying` (when allowed) during the check, then `verified`
 * (or the domain stays `active`) on success, or `error` on failure. A detached domain is never
 * re-verified.
 */
export async function runDomainVerification(
  input: RunDomainVerificationInput,
): Promise<DomainVerificationOutcome> {
  const domain = await input.repository.getDomain(input.domainId)
  if (!domain) throw new DomainNotFoundError(input.domainId)

  const from: DomainState = isDomainState(domain.status) ? domain.status : "pending"
  if (from === "detached") {
    return { ok: false, state: "detached", ownership: false, pointing: false, reason: "detached" }
  }

  if (canTransition(from, "verifying")) {
    await input.repository.setStatus(input.domainId, "verifying")
  }

  const result = await verifyDomain({
    hostname: domain.hostname,
    verificationToken: domain.verificationToken,
    expectedCnameTarget: input.expectedCnameTarget,
    resolver: input.resolver,
  })

  // Preserve `active` on a successful re-check; otherwise a pass lands on `verified`.
  const next = afterVerification(from === "active" ? "active" : "verifying", result.ok)
  await input.repository.setStatus(input.domainId, next)

  return {
    ok: result.ok,
    state: next,
    ownership: result.ownership,
    pointing: result.pointing,
    reason: result.reason,
  }
}
