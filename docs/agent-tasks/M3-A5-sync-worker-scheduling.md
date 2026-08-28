# M3-A5 — Sync worker wiring + scheduling

**Work package:** M3 (Listings and REALTOR.ca DDF) — "scheduler, manual sync, concurrency/rate
controls, dead-letter/retry behavior".

## Outcome

The worker actually runs listing syncs: it loads and decrypts a tenant's integration config, runs the
M3-A3 engine against the M3-A4 repository, and is driven on a schedule — frequent incremental deltas
and a daily full reconciliation — fanned out over all connected tenants, one job per credential.

## Why now

M3-A3/A4 gave a testable engine and a real repository. This connects them to real config + pg-boss
so listings sync end to end (once a connected integration exists, written by the M3-A6a connect UI).

## Scope

- `@realtr/core` config module: `encryptIntegrationConfig`/`decryptIntegrationConfig` (`{ enc }`
  convention over `INTEGRATION_ENCRYPTION_KEY`), `loadListingSourceConfig(org, provider)` (decrypts a
  connected integration or returns null), `listConnectedListingSources()` (for the dispatcher).
- Sync handler: adds `mode` (incremental|reconcile), loads config, runs `runListingSync`, fails
  loudly on unknown provider / no connected integration / provider error (pg-boss retries).
- Dispatcher: enumerates connected sources and enqueues one sync job per tenant, per cadence.
- Runtime: creates queues, wires the real repository + config loaders, schedules the incremental
  (`15 * * * *`) and reconcile (`30 23 * * *`) dispatchers, and enqueues syncs with a
  `${org}:${provider}` singletonKey so a credential never runs concurrent/duplicate syncs.

## Non-goals

- Connect/config UI + connection test (M3-A6a) — the writer of encrypted credentials.
- Public listing rendering + attribution invariants (M3-A6).
- Manual "sync now" UI button (trivial `boss.send` once the UI exists).

## Ownership

- `packages/core/src/integrations/config.ts` (+ core index, `./sync` subpath export)
- `apps/worker/src/listings-sync.ts` (+ test), `apps/worker/src/listings-dispatch.ts` (+ test),
  `apps/worker/src/runtime.ts`

## Acceptance criteria

- The sync handler loads decrypted config, runs the engine with the requested mode, and never logs
  secrets; unknown provider / missing integration / provider failure all throw so pg-boss retries.
- The dispatcher enqueues one job per connected source with the requested mode.
- Scheduling registers incremental + reconcile cadences; syncs are enqueued with a per-credential
  singleton key.
- Worker unit tests pass with no database (engine subpath import avoids the db-bound config module);
  `check`, `test:unit`, Biome, and `build` pass.

## Verification

- `pnpm --filter @realtr/worker run test:unit`, `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`, `pnpm test:unit`
