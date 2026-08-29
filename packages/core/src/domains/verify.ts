// Domain ownership + DNS-pointing verification (M5). Pure over an injectable resolver so it is fully
// unit-testable with no network. Two independent checks:
//   - ownership: a TXT record at `_realtr-challenge.<hostname>` contains the site's verification token
//   - pointing:  a CNAME for <hostname> resolves to the platform's serving host (the renderer edge)
// A domain is "verified" when it both proves ownership and points at us.

export interface DnsResolver {
  resolveCname(hostname: string): Promise<string[]>
  resolveTxt(hostname: string): Promise<string[]>
}

export const CHALLENGE_SUBDOMAIN = "_realtr-challenge"

export interface VerifyInput {
  hostname: string
  /** The token stored on the domain row; must appear in the challenge TXT record. */
  verificationToken: string
  /** The host custom domains should CNAME to (e.g. sites.realtr.app). */
  expectedCnameTarget: string
  resolver: DnsResolver
}

export interface VerifyResult {
  ok: boolean
  ownership: boolean
  pointing: boolean
  reason?: string
}

/** Normalize a DNS host for comparison: lowercase, strip a single trailing dot. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "")
}

async function checkOwnership(input: VerifyInput): Promise<boolean> {
  const challengeHost = `${CHALLENGE_SUBDOMAIN}.${normalizeHost(input.hostname)}`
  try {
    const records = await input.resolver.resolveTxt(challengeHost)
    const token = input.verificationToken.trim()
    return records.some((record) => record.trim() === token)
  } catch {
    return false
  }
}

async function checkPointing(input: VerifyInput): Promise<boolean> {
  const target = normalizeHost(input.expectedCnameTarget)
  try {
    const records = await input.resolver.resolveCname(normalizeHost(input.hostname))
    return records.some((record) => normalizeHost(record) === target)
  } catch {
    return false
  }
}

export async function verifyDomain(input: VerifyInput): Promise<VerifyResult> {
  const [ownership, pointing] = await Promise.all([checkOwnership(input), checkPointing(input)])
  if (ownership && pointing) return { ok: true, ownership, pointing }
  const missing = [
    !ownership ? "ownership (TXT challenge)" : null,
    !pointing ? "DNS pointing (CNAME)" : null,
  ]
    .filter(Boolean)
    .join(" and ")
  return { ok: false, ownership, pointing, reason: `Failed: ${missing}` }
}

/** The DNS records a customer must create, for display in the connect-domain UI. */
export function dnsInstructions(input: {
  hostname: string
  verificationToken: string
  expectedCnameTarget: string
}): Array<{ type: "TXT" | "CNAME"; name: string; value: string }> {
  return [
    {
      type: "TXT",
      name: `${CHALLENGE_SUBDOMAIN}.${normalizeHost(input.hostname)}`,
      value: input.verificationToken,
    },
    {
      type: "CNAME",
      name: normalizeHost(input.hostname),
      value: normalizeHost(input.expectedCnameTarget),
    },
  ]
}
