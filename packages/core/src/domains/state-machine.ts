// Domain lifecycle state machine (M5). A custom domain moves through explicit states; only `active`
// domains are served, and only `verified`/`active` domains are eligible for certificate issuance.
// This module is pure — the DB column stays free-text `status`, and callers validate transitions
// here rather than scattering string checks.

export const DOMAIN_STATES = [
  "pending", // created, not yet checked
  "verifying", // a verification attempt is in progress
  "verified", // ownership + DNS pointing confirmed; eligible for a cert
  "active", // certificate issued and the host is being served
  "error", // last verification/issuance failed; retryable
  "detached", // removed from the site; terminal
] as const

export type DomainState = (typeof DOMAIN_STATES)[number]

// Allowed transitions. `detached` is terminal. Every non-terminal state can be detached (removal).
const TRANSITIONS: Record<DomainState, readonly DomainState[]> = {
  pending: ["verifying", "detached"],
  verifying: ["verified", "error", "pending", "detached"],
  verified: ["active", "verifying", "error", "detached"],
  active: ["verified", "error", "detached"],
  error: ["verifying", "pending", "detached"],
  detached: [],
}

export function isDomainState(value: string): value is DomainState {
  return (DOMAIN_STATES as readonly string[]).includes(value)
}

export function canTransition(from: DomainState, to: DomainState): boolean {
  return TRANSITIONS[from].includes(to)
}

export class DomainTransitionError extends Error {
  constructor(
    readonly from: DomainState,
    readonly to: DomainState,
  ) {
    super(`Invalid domain transition: ${from} -> ${to}`)
  }
}

export function assertTransition(from: DomainState, to: DomainState): void {
  if (!canTransition(from, to)) throw new DomainTransitionError(from, to)
}

/** Only `active` domains are served publicly. */
export function isServable(state: DomainState): boolean {
  return state === "active"
}

/**
 * A cert may be issued only once ownership + pointing are confirmed. Gating on-demand TLS to this
 * prevents an unverified domain pointed at our IP from triggering certificate issuance.
 */
export function isCertEligible(state: DomainState): boolean {
  return state === "verified" || state === "active"
}

/** Next state after a verification attempt, given the current state and whether it succeeded. */
export function afterVerification(from: DomainState, ok: boolean): DomainState {
  if (ok) return from === "active" ? "active" : "verified"
  return "error"
}
