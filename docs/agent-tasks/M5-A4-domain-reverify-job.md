# M5-A4 — Scheduled domain re-verification job

**Work package:** M5 (Domains and publication routing) — "background verification".

## Outcome

The worker re-verifies custom domains on a schedule, so a domain whose DNS propagates after the user
clicks Verify (or was added and left) flips to `verified` automatically — no manual retry. Reuses the
M5-A1/A2/A3 verification service, resolver, and repository.

## Scope

- `@realtr/db`: `listDomainsAwaitingVerification` — domains in `pending`/`verifying`/`error`
  (`active`/`verified` are left alone to avoid flapping a working domain on a transient DNS blip;
  `detached` is terminal).
- Worker `domains-verify.ts`: `handleDomainsVerify` (dependency-injected `verify(domainId)`; DB-free
  tests) that runs verification for one domain and logs the resulting state; errors propagate so
  pg-boss retries.
- Worker `domains-dispatch.ts`: `handleDomainsDispatch` enumerates awaiting domains and enqueues one
  verify job each.
- Runtime: two queues + a `*/15 * * * *` dispatcher schedule; verify jobs enqueued with a per-domain
  `singletonKey` so checks never pile up. Uses `nodeDnsResolver` + `RENDERER_BASE_HOST` (read from
  env with a fallback; no worker env-schema change).

## Non-goals (later)

- Re-checking `verified`/`active` domains to auto-detect breakage/detachment (needs a
  flap-resistant policy; deliberately excluded).
- Certificate-issued → `active` transition automation and status polling in the UI.

## Ownership

- `packages/db/src/domains.ts` (`listDomainsAwaitingVerification`)
- `apps/worker/src/domains-verify.ts` (+ test), `apps/worker/src/domains-dispatch.ts` (+ test),
  `apps/worker/src/runtime.ts`

## Acceptance criteria

- The dispatcher enqueues one verify job per awaiting domain; the verify handler runs the service and
  logs state; both reject malformed payloads and verify errors retry.
- `active`/`verified`/`detached` domains are not picked up by the dispatcher.
- `check`, `test:unit`, Biome, and `build` pass.

## Verification

- `pnpm --filter @realtr/worker run test:unit`, `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`
