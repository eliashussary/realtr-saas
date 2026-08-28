# M3-A3 — Listing sync engine + reconciliation (repository port)

**Work package:** M3 (Listings and REALTOR.ca DDF) — "incremental sync pipeline that … normalizes
and upserts in transactions, marks stale/deleted listings, records runs/errors, and is idempotent".

## Outcome

A provider-neutral `runListingSync` engine in `@realtr/core` that orchestrates a source's incremental
delta and its full master-list reconciliation over a **repository port**, records run diagnostics,
and never advances the checkpoint or removes listings on failure. Fully offline unit-tested with an
in-memory repository.

## Why now

M3-A1/A2 gave a client and a `verify`/`sync`/`listEntitlement` contract. The engine is the algorithm
the M3-D1 brief specified (overlap window, idempotent upserts, remove only from a successful complete
master list, checkpoint only on durable success). Building it behind a port keeps the
Technology-Provider evolution additive (ADR 0006).

## Scope

- `ListingSyncRepository` port: `getCheckpoint`, `upsertListings`, `markRemovedNotIn`, `recordRun`.
- `runListingSync({ mode: "incremental" | "reconcile", ... })`:
  - incremental: read checkpoint → apply overlap window → `source.sync` → upsert → advance checkpoint.
  - reconcile: `source.listEntitlement` → mark listings whose `sourceKey` is absent as removed.
  - failure: record a failed run, leave the checkpoint untouched, remove nothing, rethrow (retry).
  - empty-master-list safety valve (`allowEmptyEntitlement`, default off).

## Non-goals

- Drizzle schema/migration + the real repository implementation (M3-A4).
- Loading/decrypting integration config and scheduling/concurrency (M3-A4/A5).
- Canonical shared-property / per-destination entitlement schema (post-MVP TP track — ADR 0006).

## TP seams preserved (ADR 0006)

- Engine talks only to the repository port; a future shared-canonical + entitlement repository drops
  in unchanged.
- Removal is driven by master-list membership on `sourceKey` (DDF ListingKey), the cross-tenant dedup
  identity — the same shape a per-`DestinationId` master list will take.

## Ownership

- `packages/core/src/integrations/sync.ts` (+ `sync.test.ts`), `packages/core/src/index.ts`

## Acceptance criteria

- Incremental upserts and advances the checkpoint; a stored checkpoint yields an overlapped `since`.
- Reconcile removes listings absent from the master list; an empty list removes nothing unless
  explicitly allowed.
- Any provider failure records a failed run, does not advance the checkpoint, removes nothing, and
  rethrows.
- `check`, `test:unit`, Biome, and `build` pass.

## Verification

- `pnpm --filter @realtr/core run test:unit`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`
