# ADR 0002: Test foundation

- Status: Accepted
- Date: 2026-08-27

## Context

Safety work needs one repeatable TypeScript test setup for fast pure tests and PostgreSQL-backed
tenant tests. Tests must not infer permission to clean the normal development database.

## Decision

Use Vitest for unit and integration tests. It matches the repository's Vite, ESM, TypeScript, and
React 19 stack, supports one-shot execution without a separate transpilation step, and lets each
workspace keep narrow test discovery.

`pnpm test:unit` runs all workspace unit suites without PostgreSQL. `pnpm test:integration` owns an
ephemeral Docker Compose PostgreSQL service and always tears it down. `pnpm test` runs both in that
order and is the canonical local/CI command.

Database tests require `TEST_DATABASE_URL`. The database name must start with `test_` or end with
`_test`; validation happens before a pool is created or cleanup SQL is issued. The integration
launcher defaults only this explicit variable to the isolated `realtr_test` service and never reads
`DATABASE_URL`. It migrates the empty database with committed Drizzle migrations, truncates the
test-owned tables around tests, and closes its pool.

Fixtures are tenant-explicit. The baseline fixture creates two named users, organizations,
memberships, sites, and domains and returns both organization IDs so later authorization tests must
choose a tenant rather than relying on ambient state.

## Consequences

- Local integration tests require Docker with Compose and free host port 5434.
- CI must provide Docker/Compose or set `TEST_DATABASE_URL` to a dedicated PostgreSQL database whose
  name satisfies the fail-closed convention.
- Workspace unit scripts remain independently runnable and should stay free of database imports.
