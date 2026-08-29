# M5-A3 — Domain verification wired end-to-end

**Work package:** M5 (Domains and publication routing) — "ownership challenge and DNS inspection,
background verification, CNAME/A guidance".

## Outcome

A custom domain can now actually be verified from the control centre: the connect-domain UI shows the
exact DNS records to create, a "Verify" action runs a real DNS check, and the domain transitions
pending → verifying → verified (or error). Only verified/active domains are served and receive a TLS
cert (`isServableDomain`, already gated), so this closes the loop that previously left custom domains
stuck in `pending` forever.

## Scope

- `@realtr/core`: real `nodeDnsResolver` (node:dns adapter over the M5-A1 `DnsResolver` port); export
  the domain state machine, verifier, service, and resolver from the package index.
- `@realtr/db`: `./domains` subpath export for `createDomainRepository` (M5-A2).
- App server `domains.ts`: `getDomainSetupFn` (status + TXT/CNAME instructions) and `verifyDomainFn`
  (owner/admin; runs `runDomainVerification` with the real resolver + repo; returns `verified`
  distinct from the transport `ok`). Both scope the domain to the caller's org.
- Dashboard: `DomainRow` with per-custom-domain "Verify" + "DNS setup" (shows the records) actions.
- DB integration test for `createDomainRepository`.

## Non-goals (later slices)

- Background re-verification job (scheduled) and status polling; certificate-issued → `active`
  transition automation.
- Subdomain provisioning UX changes; production URL generation from configured scheme/hosts.
- Caddy cert storage / on-demand hardening (tracked in ADR 0007).

## Ownership

- `packages/core/src/domains/resolver.ts`, `packages/core/src/index.ts`
- `packages/db/package.json` (`./domains`), `packages/db/test/domain-repo.integration.test.ts`
- `apps/app/src/server/domains.ts`, `apps/app/src/routes/_dashboard.index.tsx`

## Acceptance criteria

- Adding a custom domain, showing DNS setup, and clicking Verify transitions and (on success) makes
  the domain servable; results are scoped to the caller's org and gated to owner/admin for the
  mutation.
- `verifyDomainFn` reports verification success separately from transport success.
- `check`, `test:unit`, Biome, `build`, and CSS budgets pass; the domain-repo integration test passes
  against Postgres in CI.

## Verification

- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`, `pnpm test:unit`,
  `node scripts/check-css-budgets.mjs`
- Manual (needs DNS): add a domain, create the shown TXT + CNAME, click Verify.
