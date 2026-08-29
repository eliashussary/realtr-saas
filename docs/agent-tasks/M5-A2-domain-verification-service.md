# M5-A2 — Domain verification service + repository

**Work package:** M5 (Domains and publication routing) — "background verification" foundation.

> Code-only, no migration, no shared-file edits (parallel-safe). Uses the existing `domain` table's
> free-text `status` column to carry `DomainState` values. Wiring a "verify now" server function, a
> background job, and the real `node:dns` resolver are follow-up slices.

## Outcome

`runDomainVerification` (in `@realtr/core`) runs the M5-A1 DNS check for a domain and persists the
resulting lifecycle state through a repository port, plus a Drizzle `createDomainRepository`
implementing that port over the existing table.

## Scope

- `domains/service.ts`: `DomainRepository` port (`getDomain`/`setStatus`) + `runDomainVerification`
  — transitions `-> verifying` (when allowed) during the check, then `verified` (or keeps `active`)
  on success / `error` on failure; never re-verifies a `detached` domain.
- `packages/db/src/domains.ts`: `createDomainRepository(db)` over the existing `domain` table (no
  schema change).

## Non-goals (later slices)

- Real `node:dns/promises` resolver adapter; a "verify now" server fn + connect-domain UI (DNS
  instructions, status) — deferred until the dashboard layout settles (it's under concurrent edit).
- Background re-verification job and Caddy on-demand-TLS gating on `isCertEligible`.
- Optional `lastCheckedAt`/`lastError` columns (would need a migration).

## Ownership

- `packages/core/src/domains/service.ts` (+ test), `packages/db/src/domains.ts`. New files; not yet
  exported from package indexes (added when first consumed) to avoid churn on concurrently-edited
  shared files.

## Acceptance criteria

- Service transitions pending→verifying→verified on success, →error on failure, keeps active on
  re-check, and refuses detached; missing domain throws.
- Repository reads/writes the existing `domain` row with no migration.
- `pnpm --filter @realtr/core run check`/`test:unit` and `pnpm --filter @realtr/db run check` pass.
