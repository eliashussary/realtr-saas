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
