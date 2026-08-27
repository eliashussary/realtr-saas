# M0-F1 — Worker lifecycle and validated jobs

- Status: ready
- Milestone: M0 — Safety and delivery foundation

## Outcome

The worker starts and stops predictably, accepts only validated versioned job payloads, performs no
sample work in production, and exposes testable failure behavior.

## Why now

The current worker enqueues a demo DDF job on every boot, passes empty provider configuration, and
does not define shutdown or payload-validation behavior. DDF work should build on a safe lifecycle.

## Required context

- merged M0-C1 test commands
- `apps/worker/src/index.ts` and `env.ts`
- `packages/core/src/integrations/sources/**` and registry exports
- `packages/db/src/schema/integration.ts`
- `packages/core/src/crypto.ts`
- Docker Compose worker definitions and `.env.example`

## Dependencies

- M0-C1 accepted

## Scope

- Extract worker construction/lifecycle from an unconditional module-level `main()` so behavior is
  testable.
- Define and validate an explicit, versioned `listings.sync` payload schema.
- Remove automatic demo enqueue from normal startup. If useful, expose it through an explicit
  development command or seed operation that cannot run accidentally in production.
- Validate worker environment configuration at startup with actionable secret-safe errors.
- Add SIGTERM/SIGINT graceful shutdown for pg-boss, database resources owned by the worker, and the
  health server.
- Define behavior for malformed jobs, unknown providers, provider failures, and shutdown during
  work. Use pg-boss retry semantics intentionally and avoid acknowledging failed work as success.
- Add focused tests without contacting DDF or requiring production credentials.
- Assess integration config loading/decryption, but implement it only if the accepted authorization/
  crypto contracts make tenant-safe behavior unambiguous; otherwise leave a precise follow-up for M3.

## Non-goals

- Real DDF authentication or ingestion
- Listing persistence or canonical model design
- A complete scheduler, dead-letter UI, or operations dashboard
- Schema changes unless separately coordinated

## Ownership

Expected files are under `apps/worker`, with narrow shared schemas in `packages/core` if justified,
plus manifests/env docs and tests. Coordinate lockfile edits with M0-G1 and schema edits with M0-E1.

## Constraints

- Job logs must not expose credentials or raw tenant configuration.
- Unknown/malformed/provider-failed jobs must follow documented retry/dead-letter behavior.
- Health readiness must not claim ready before pg-boss is usable; distinguish liveness if needed.
- Shutdown must be bounded and must not corrupt or silently lose in-flight work.

## Acceptance criteria

- Production/default startup enqueues no demo job.
- Invalid environment and invalid payloads fail predictably with secret-safe diagnostics.
- Unknown provider and throwing provider paths are covered and not reported as successful syncs.
- SIGTERM/SIGINT tests or controlled integration evidence show resources close and the process exits.
- Starting and stopping repeatedly leaves no open port, pool, or watcher.
- Job payload version and compatibility expectations are documented.

## Verification

Run focused worker tests plus:

```bash
pnpm --filter @realtr/worker check
pnpm check
pnpm build
```

Start the worker against a disposable test database, verify health/readiness, send a controlled job,
terminate it, and confirm clean exit. Verify an ordinary restart creates no jobs by itself.

## Handoff

Follow the standard handoff. Include lifecycle state behavior, payload schema, retry/failure choices,
shutdown evidence, and exact M3 follow-ups for integration config and listing persistence.
