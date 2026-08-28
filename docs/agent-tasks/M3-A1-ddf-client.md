# M3-A1 — RESO/OData DDF client

**Work package:** M3 (Listings and REALTOR.ca DDF) — "DDF client with typed configuration,
authentication, pagination, retry/backoff, timeout, and fixture contract tests".

## Outcome

A provider-neutral, fully offline-testable `@realtr/ddf` package that speaks the REALTOR.ca DDF
RESO Web API (OData): OAuth2 client-credentials auth with pre-expiry refresh, deterministic
paginated Property reads, replication (master-list) reads, and retry/backoff for transient failures.
No live calls, no committed real data.

## Why now

M3's external gate (CREA Technology-Provider onboarding) blocks the *canonical model* and production
credentials, but not the client itself. The existing single-tenant `libs/reso-client` +
`libs/crea-etl` in the `realtr` repo is a working reference; this ports and modernizes the transport
so the sync engine (M3-A3) has a tested client to build on.

## Reference

- `realtr` repo: `libs/reso-client/client.ts` (OAuth, OData, nextLink pagination), `types.ts` (RESO
  Property/Media/Room), `libs/crea-etl/crea-etl.ts` (delta + PropertyReplication reconciliation).
- `docs/research/2026-08-27-realtor-ca-ddf-discovery.md` (protocol, pagination, delta/delete, limits).

## Scope

- `DdfClient`: `authenticate` (token endpoint, scope `DDFApi_Read`), transparent refresh within a
  skew window, `getPropertyPage`/`getReplicationPage`, `paginate` (follows `@odata.nextLink`),
  `collectProperties`/`collectReplication` (dedupe by `ListingKey`).
- `buildPropertyQuery`/`buildReplicationQuery`: delta `ModificationTimestamp gt`, optional bbox,
  deterministic `$orderby`, `$top ≤ 100`.
- Retry/backoff (408/429/5xx/network) honoring `Retry-After`, capped; timeouts; injectable
  `fetch`/`now`/`sleep` for network-free tests.
- Trimmed, display-minimized RESO types (data minimization per the brief).
- Synthetic fixtures (`.invalid`/`.test`, fake keys) + contract tests.

## Non-goals

- Normalization to Realtr's listing shape (M3-A2), persistence/reconciliation (M3-A3), scheduling
  (M3-A4), any live network call, or committing real/sanitized captures.

## Ownership

- `packages/ddf/**` (new package: `client.ts`, `query.ts`, `types.ts`, `fixtures/`, tests)

## Acceptance criteria

- Auth exchanges client credentials, sends a bearer token, and refreshes within the skew window;
  a failed exchange throws `DdfAuthError`.
- Pagination follows `@odata.nextLink` and dedupes by `ListingKey`; delta requests carry the
  timestamp filter and deterministic ordering.
- Transient 429/5xx retry then succeed; a non-retryable status throws `DdfRequestError`; retries are
  capped.
- All tests run with zero network via injected `fetch`.
- `check`, `test:unit`, Biome, and `build` pass.

## Verification

- `pnpm --filter @realtr/ddf run test:unit`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`
