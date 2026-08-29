# Security review — pre-launch (2026-08-29)

Scope: the M7 launch security review — tenant isolation, authentication, SSRF/DNS/domain, webhooks,
public forms, secrets/key management, and dependency scanning across `realtr-saas`. Findings are rated
and either **fixed in this pass** or **tracked** with remediation. Re-run before GA.

## Fixed in this pass (M7-A5)

### 1. Magic-link URL logged in production — HIGH ✅ fixed
`apps/app/src/lib/auth.ts` `sendMagicLink` called `console.log(url)` unconditionally. A magic link is a
bearer login credential; in production it would be written to logs, so anyone with log access could
sign in as any user. Now logged only when `NODE_ENV !== "production"`. (Production email transport —
Resend — is still the deferred M1/M7 item; until wired, production surfaces the link nowhere, which is
the safe failure mode.)

### 2. Hardcoded session secret fallback — HIGH ✅ fixed
`auth.ts` used `process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me-please-32bytes"`. If the env var
were unset in production, sessions would be signed with a publicly known secret → session forgery. The
app now **fails fast** (`throw`) when `BETTER_AUTH_SECRET` is unset in production; the dev fallback is
returned only outside production.

### 3. No auth CSRF / redirect allow-list — MEDIUM ✅ fixed
better-auth `trustedOrigins` was unset. Now derived from `BETTER_AUTH_URL` plus an optional
`BETTER_AUTH_TRUSTED_ORIGINS` (CSV), hardening cross-origin auth requests and redirect targets.

## Verified sound (no change needed)

- **Tenant isolation** — every server function resolves authorization via the shared guard
  (`resolveOrganizationAuthorization` / `requireAuthorization` / super-admin checks); all 60+ server
  fns are guarded. Data reads/writes are `organizationId`-scoped; admin cross-tenant writes verify org
  ownership (e.g. `adminSetDomainStatus` joins through `site`).
- **Custom-domain claiming** — `domain.hostname` is globally `unique`; add is `onConflictDoNothing`
  and requires a per-tenant TXT challenge to verify, so one tenant cannot hijack another's (or the
  platform's) domain. Input rejects IPs (all-digit TLD), `:`/`/`/`*`, `localhost`, and the platform
  host + its subdomains.
- **SSRF** — domain verification performs only DNS TXT/CNAME resolution (no outbound HTTP to
  tenant-supplied hosts); no user-controlled URL is fetched server-side.
- **Stripe webhook** — signature-verified (`constructEvent`) before any processing; event-id ledger +
  re-fetch-and-converge; unconfigured → 503 (never a silent ack).
- **Public forms / XSS** — `/api/lead` has honeypot + rate limit + consent + host→tenant resolution +
  entitlement gate. Rendered site content is React (no raw-HTML sink for tenant content); the only
  `dangerouslySetInnerHTML` uses are `serializeJsonLd` (escapes every `<` to `<`, preventing
  `</script>` breakout) and two developer-authored constant scripts.
- **Preview links** — 256-bit random token, sha256-hashed at rest, with expiry + revocation.
- **Integration credentials** — AES-256-GCM via `INTEGRATION_ENCRYPTION_KEY`, which **fails fast** if
  unset (no fallback); ciphertext stored as jsonb, never logged. `reportError` logs message/stack/
  explicit context only — no secrets.
- **Dev auth bypass** — `/api/dev/magic-link` is double-gated (404 in production, and
  `getLastDevMagicLink()` returns null in production).

## Tracked (remediation planned, not fixed in this pass)

### T1. `drizzle-orm` ^0.38.4 < 0.45.2 advisory (GHSA-gpj5-g38j-94v9) — HIGH ✅ RESOLVED
Upgraded the catalog to `drizzle-orm ^0.45.2` + `drizzle-kit ^0.31.10`. All-package typecheck (Drizzle's
strict types catch query-shape breaks), unit tests, and `pnpm -r build` pass; `drizzle-kit generate`
reports no schema drift (existing migrations + meta are compatible); drizzle-orm no longer appears in
`pnpm audit --prod`. **Pre-deploy gate:** run `pnpm test:integration` (Postgres — not available in the
dev sandbox) in CI to exercise the real query paths (listing sync, domains, billing, data export).

### T2. Framework-transitive advisories (`js-yaml`, `nanoid`, `postcss` via `@tanstack/react-start`) —
MODERATE/HIGH. Reached only through the framework; not in our direct call paths. Remediation: update
`@tanstack/react-start` when a patched release is available; re-run `pnpm audit --prod`. Dev-only
advisories (via `vitest`/`vite`) do not ship and are out of scope.

### T3. In-memory lead rate limiter — MEDIUM
`leads-screen.ts` rate-limits with a per-process `Map`; it resets on restart and does not span
instances. Acceptable on the single-node topology (ADR 0007); move to a shared store (Postgres/Redis)
when scaling horizontally.

### T4. `/internal/tls-check` reachability — LOW (ops)
The renderer's on-demand-TLS `ask` endpoint should be reachable only from the reverse proxy, not the
public internet (it discloses which domains are active). Restrict at the Caddy/network layer in the
production topology (ADR 0007); no app change.

## Follow-ups feeding other M7 packets

- Production magic-link email (Resend) — shared M1/M7 deferral; required before external users can log
  in at all in production.
- Data export & deletion endpoints — M7-A7 (privacy/compliance).
