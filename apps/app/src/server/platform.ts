// Platform subdomain + URL helpers. A tenant site is always reachable on a Realtr subdomain
// (e.g. demo.localhost in dev, demo.sites.realtr.app in prod) without operator action; custom
// domains are added later and are pending until verified.

/** Base host for platform subdomains. Dev resolves *.localhost to 127.0.0.1; prod overrides. */
export function platformHost(): string {
  return process.env.PLATFORM_HOST ?? "localhost"
}

/** Stable, hostname-safe platform subdomain derived from an org slug. */
export function platformHostname(orgSlug: string): string {
  const sub =
    orgSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "site"
  return `${sub}.${platformHost()}`
}

// ponytail: dev URL only (http + :3000). Production scheme/host URL generation is M5.
export function siteUrl(hostname: string): string {
  return `http://${hostname}:3000`
}

/** Domain states the renderer will actually serve. */
export function isServableStatus(status: string): boolean {
  return status === "active" || status === "verified"
}

/** True if a hostname is one of our platform subdomains (vs. a customer's custom domain). */
export function isPlatformHostname(hostname: string): boolean {
  return hostname.endsWith(`.${platformHost()}`)
}

/** Extract the subdomain label from a platform hostname (e.g. "demo.localhost" -> "demo"). */
export function subdomainLabel(hostname: string): string {
  const suffix = `.${platformHost()}`
  return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : hostname
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "ftp",
  "sites",
  "realtr",
  "internal",
  "preview",
  "assets",
  "static",
])

export type SubdomainValidation = { ok: true; label: string } | { ok: false; reason: string }

/** Validate a requested subdomain label as a safe, single DNS label. */
export function validateSubdomain(input: string): SubdomainValidation {
  const label = input.trim().toLowerCase()
  if (label.length < 3 || label.length > 63) {
    return { ok: false, reason: "Use 3–63 characters." }
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
    return { ok: false, reason: "Use lowercase letters, numbers, and hyphens." }
  }
  if (RESERVED_SUBDOMAINS.has(label)) {
    return { ok: false, reason: "That subdomain is reserved." }
  }
  return { ok: true, label }
}
