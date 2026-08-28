# M3-A6a — DDF connect UI + service

**Work package:** M3 (Listings and REALTOR.ca DDF) — "integration setup/test/disconnect UI with
credential redaction".

## Outcome

A realtor can connect their own DDF Web API key from the control centre: enter credentials, test the
connection, store them encrypted, see sync status/freshness, and disconnect. This is the missing link
that makes the whole M3-A1…A5 pipeline runnable end to end.

## Why now

The engine (A3), persistence (A4), and worker/scheduler (A5) are built but have nothing to run —
there was no way to write a tenant's credentials. This writes them (encrypted) and flips the
integration to `connected` so the dispatcher picks it up.

## Scope

- `integration` unique on `(organization, kind, provider)` + migration `0008` (enables upsert).
- App-server service (`apps/app/src/server/listings.ts`): `testListingSourceFn` (verify only),
  `connectListingSourceFn` (verify → encrypt → upsert connected), `disconnectListingSourceFn` (mark
  disconnected + stop serving via `markRemovedNotIn(org, provider, [])`), `getListingStatusFn`
  (status, active count, last run + freshness, last reconcile). Authorized (owner/admin to mutate),
  credentials never returned, provider errors truncated/safe.
- Dashboard `ListingsCard`: status badge + freshness, credential form (Client ID / secret as
  password), Connect / Test / Update key / Disconnect.
- Config stored per the `{ enc }` convention (`encryptIntegrationConfig`); consumed by the worker's
  `loadListingSourceConfig` (A5).

## Non-goals

- Manual "sync now" button (trivial `boss.send`; deferred).
- Public listing rendering + attribution invariants (M3-A6).
- Org-scoped audit-event table for integration mutations (follow-up).
- Hard purge on disconnect (soft stop-serving now; retention policy per ADR 0006).

## Ownership

- `packages/db/src/schema/integration.ts`, `packages/db/drizzle/0008_*.sql`
- `apps/app/src/server/listings.ts`, `apps/app/src/components/listings-card.tsx`,
  `apps/app/src/routes/index.tsx`, `apps/app/package.json` (adds `@realtr/core`)

## Acceptance criteria

- Connect verifies before persisting; bad credentials surface a safe error and store nothing.
- Stored credentials are encrypted and never returned to the client; only owner/admin can mutate.
- Status shows connection state, active-listing count, and last-sync freshness/errors.
- Disconnect stops serving the tenant's listings.
- `check`, `test:unit`, Biome, `build`, and the app CSS budget pass.

## Verification

- `pnpm --filter @realtr/db run db:generate` (clean), `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`, `pnpm test:unit`, `node scripts/check-css-budgets.mjs`
- Manual (needs a real DDF key + network): connect, observe status, disconnect.
