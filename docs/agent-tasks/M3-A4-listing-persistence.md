# M3-A4 — Listing persistence (schema + repository)

**Work package:** M3 (Listings and REALTOR.ca DDF) — the persistence half of "incremental sync
pipeline that … normalizes and upserts in transactions, marks stale/deleted listings, records
runs/errors, and is idempotent".

## Outcome

The concrete `ListingSyncRepository` the M3-A3 engine runs against: additive Drizzle schema
(listing columns + `listing_sync_state` + `listing_sync_run`), a transactional tenant-copy
repository (`createListingRepository`), a generated migration, and integration tests.

## Why now

M3-A3 defined the engine over a repository *port*. This lands the real Postgres implementation so a
tenant's listings actually persist, dedupe, reconcile, and record run health.

## Scope

- `schema/listing.ts`: add `sourceKey` (DDF ListingKey — dedup/reconcile identity), `status`,
  `sourceModifiedAt`, `lastSeenAt`, and a `(org, source, sourceKey)` index; keep the tenant-scoped
  `(org, source, sourceListingId)` unique.
- `listing_sync_state` (checkpoint + last-reconciled per org/provider) and `listing_sync_run` (run
  diagnostics: counts, error, timings) — both able to gain a `destinationId` dimension additively
  (ADR 0006).
- `createListingRepository(db)`: `getCheckpoint`, transactional idempotent `upsertListings`
  (onConflict by tenant identity), `markRemovedNotIn` (status→removed; empty list removes all in
  scope), `recordRun` (insert run + advance checkpoint / last-reconciled on success). Plus
  `listActiveListings` for M3-A6.
- Generated migration `0007_*`.

## Non-goals

- Worker wiring: loading + decrypting integration config, constructing the repository, and running
  incremental/reconcile jobs (M3-A5).
- Scheduling/concurrency (M3-A5), connect UI (M3-A6a), public rendering (M3-A6).

## TP seams preserved (ADR 0006)

- `sourceKey` persisted as the cross-tenant dedup identity; removal keyed on it.
- The repository is the swap point: a future shared-canonical + per-destination-entitlement
  repository implements the same methods without touching the engine.

## Ownership

- `packages/db/src/schema/listing.ts`, `packages/db/src/listings.ts`, `packages/db/package.json`
- `packages/db/drizzle/0007_*.sql`
- `packages/db/test/listing-sync.integration.test.ts`; update `listing-identity.integration.test.ts`
  for the new `sourceKey` column.

## Acceptance criteria

- Upserts are idempotent by tenant identity and set `sourceKey`/`status`/timestamps; a succeeded
  incremental run advances the checkpoint; reconcile marks absent `sourceKey`s removed and is
  tenant-scoped.
- Migration generates cleanly and matches the schema.
- `check`, `test:unit`, Biome, and `build` pass; integration tests pass against Postgres in CI.

## Verification

- `pnpm --filter @realtr/db run db:generate` (clean), `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`, `pnpm test:unit`
- Integration (CI/Postgres): `pnpm --filter @realtr/db run test:integration`
