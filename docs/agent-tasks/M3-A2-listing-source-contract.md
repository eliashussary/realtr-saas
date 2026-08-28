# M3-A2 — Listing-source contract v2 + DDF source

**Work package:** M3 (Listings and REALTOR.ca DDF) — provider interface able to express
delta/checkpoint, entitlement/removal, and run diagnostics.

## Outcome

The `ListingSource` interface is redesigned to what a real feed needs, and the DDF source implements
it on top of `@realtr/ddf` with a normalizer that maps raw DDF Property records to Realtr's display
shape (attribution preserved). The worker sync handler consumes the new contract.

## Why now

The M3-D1 brief flagged that `pull(): NormalizedListing[]` cannot express pagination checkpoints,
per-destination entitlement, removals, partial failures, or run diagnostics. With the client
(M3-A1) in place, the contract can be made honest before the sync engine (M3-A3) is built against it.

## Scope

- `ListingSource` v2: `verify(ctx)` (connectivity/credential check for the connect UI), `sync(ctx)`
  (incremental delta → `{ upserts, checkpoint }`), `listEntitlement(ctx)` (full current source-key
  set for daily master-list reconciliation — removals come from here, not from `sync`).
- `NormalizedListing` enriched: `sourceKey` (ListingKey), `sourceListingId` (ListingId), `status`,
  `sourceModifiedAt`, normalized `data`, optional retention-gated `raw`.
- DDF source: config schema (issued API credentials, not a member password — TP model), a normalizer
  (`normalizeDdfProperty`), and `verify`/`sync`/`listEntitlement` via `@realtr/ddf`.
- Update the worker handler + tests to the new contract.

## Non-goals

- Persistence, transactional upsert, and master-list reconciliation (M3-A3).
- Loading/decrypting integration config and scheduling (M3-A3/A4).
- Finalizing canonical DB identity (blocked; M3-A7 after CREA answers).

## Ownership

- `packages/core/src/integrations/sources/{types,ddf,index}.ts` (+ `ddf.test.ts`), `packages/core/src/index.ts`
- `apps/worker/src/listings-sync.ts` (+ test)
- `packages/core/package.json` (adds `@realtr/ddf`)

## Acceptance criteria

- The contract exposes verify/sync/listEntitlement; `NormalizedListing` carries source key, id,
  status, and timestamp.
- `normalizeDdfProperty` maps identity/price/address/attribution and orders media by `Order`,
  dropping URL-less entries; falls back to the resource key when `ListingId` is absent.
- The worker handler calls `sync` (not `pull`), never logs config, and propagates provider failures.
- `check`, `test:unit`, Biome, and `build` pass.

## Verification

- `pnpm --filter @realtr/core run test:unit`, `pnpm --filter @realtr/worker run test:unit`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`
