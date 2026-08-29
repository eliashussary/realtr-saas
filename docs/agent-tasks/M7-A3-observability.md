# M7-A3 — Structured logging, correlation, and error reporting

**Work package:** M7 (Operations) — the telemetry foundation so an operator can diagnose a failed
sync, domain verification, lead delivery, or billing transition from recorded logs.

## Outcome

- A dependency-free structured logger (`@realtr/core/log`): one JSON object per event in production
  (level, msg, time, + fields) for any log pipeline; a compact human line in development. `LOG_LEVEL`
  gates verbosity.
- **Correlation ids** thread a single workflow's log lines. Every worker job run gets a child logger
  with `{ queue, correlationId }` and structured `job.start` / `job.finish` (with duration) events, so
  one sync / domain-verify / lead-delivery / billing-sweep run can be followed end to end.
- A single **error-reporting seam** (`reportError`) — logs message + stack + context at error level;
  the one place a real error tracker (Sentry) would later be wired, so call sites never depend on it.
  Worker job failures, the pg-boss error handler, worker startup, the billing webhook catch, and the
  Stripe checkout/portal/seat-sync catches all route through it.

## Scope

- `@realtr/core/log` (new subpath, dependency-free): `logger` (+ `.child`), `reportError`,
  `describeError`, `newCorrelationId`, `LogLevel`/`LogFields`/`Logger` types. Unit-tested (JSON shape,
  child field merge, level threshold, error stack capture).
- `apps/worker`: `withJob(queue, run)` wraps every `boss.work` handler with a correlation id +
  start/finish/error logs and rethrows (pg-boss retry preserved); per-job `log` now flows through the
  child logger. Startup/shutdown/ready and the pg-boss error handler use the logger / `reportError`.
- `apps/app`: billing webhook, checkout, and portal error paths, and `@realtr/core` `syncSeatsForOrg`,
  route failures through `reportError` instead of bare `console.error`.
- `.env.example`: `LOG_LEVEL`.

## Non-goals (later M7)

- Wiring an actual error tracker / metrics backend / dashboards + alerts (the `reportError` seam and
  JSON logs are the integration points; standing up the vendor is an ops task).
- Request-scoped correlation for inbound HTTP (renderer/app) — jobs are covered here; HTTP correlation
  can follow if needed.
- A4 backups + runbooks; A5 security review; A6 a11y/perf/load; A7 privacy/legal + DDF launch.

## Ownership

- `packages/core/src/log.ts` (+ test), `packages/core/package.json` (`./log`),
  `packages/core/src/billing/seats.ts`
- `apps/worker/src/runtime.ts`, `apps/worker/src/index.ts`
- `apps/app/src/routes/api/billing/webhook.ts`, `apps/app/src/server/billing.ts`

## Acceptance criteria

- Production logs are one JSON object per line with level/msg/time + fields; dev logs are readable.
- Every worker job emits a correlated start/finish, and any job failure reaches `reportError` before
  the throw that triggers pg-boss retry.
- No bare `console.error` remains on the billing / worker critical paths (routed via `reportError`).
- `check`, `test:unit`, Biome, `build` pass.

## Verification

- `pnpm --filter @realtr/core run test:unit` (logger), `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`.
