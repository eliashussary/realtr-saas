# M7-A5 — Pre-launch security review

**Work package:** M7 (Operations, reliability, launch) — the launch-gating security review covering
tenant isolation, auth, SSRF/DNS/domain, webhooks, forms, secrets/keys, and dependency scanning.

## Outcome

A documented review of every security-sensitive surface (`docs/security-review-2026-08.md`), with the
high-severity findings that were ours to fix resolved in-tree and the rest tracked with concrete
remediation. Most surfaces were already sound (tenant-scoped authorization on all server fns, global
domain uniqueness + TXT challenge, Stripe signature verification, JSON-LD escaping, hashed preview
tokens, fail-fast integration-credential encryption).

## Fixed

- **Magic-link URL logged in production (HIGH)** — `auth.ts` `sendMagicLink` now logs the link only in
  non-production; a bearer login credential no longer reaches production logs.
- **Hardcoded session-secret fallback (HIGH)** — `auth.ts` fails fast when `BETTER_AUTH_SECRET` is
  unset in production instead of signing sessions with a known dev value.
- **Missing auth CSRF/redirect allow-list (MEDIUM)** — `trustedOrigins` now derives from
  `BETTER_AUTH_URL` + optional `BETTER_AUTH_TRUSTED_ORIGINS` (CSV).

## Tracked (see the review doc)

- **T1 `drizzle-orm` < 0.45.2 advisory (HIGH)** — controlled upgrade PR + integration suite; not a
  blind bump in a security commit.
- **T2 framework-transitive advisories** (`js-yaml`/`nanoid`/`postcss` via `@tanstack/react-start`) —
  update the framework when patched.
- **T3 in-memory lead rate limiter (MEDIUM)** — durable store when scaling past one node.
- **T4 `/internal/tls-check` reachability (LOW/ops)** — restrict to the reverse proxy.

## Ownership

- `apps/app/src/lib/auth.ts`, `.env.example` (`BETTER_AUTH_TRUSTED_ORIGINS`, secret guidance)
- `docs/security-review-2026-08.md` (the review record)

## Acceptance criteria

- Critical/high findings that are fixable in-app are resolved; the rest are documented with owners and
  remediation. (M7 criterion: "critical security findings are resolved.")
- `check`, `test:unit`, Biome, `build` pass.

## Verification

- `pnpm --filter @realtr/app run check`, `pnpm --filter @realtr/app build`, `biome check .`; the auth
  change is covered by the app boot/build. `pnpm audit --prod` re-run after T1/T2 upgrades.
