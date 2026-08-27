# M0-C1 — Test foundation

- Status: ready
- Milestone: M0 — Safety and delivery foundation

## Outcome

The monorepo has a documented, repeatable automated test foundation that supports fast unit tests
and tenant-aware PostgreSQL integration tests with isolated fixtures for two organizations.

## Why now

Authorization, migrations, providers, and worker behavior all require regression tests. Establish
the harness before those agents invent incompatible test setups.

## Required context

- `AGENTS.md`
- root `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- all workspace `package.json` and `tsconfig.json` files
- `packages/db/src/client.ts`, `packages/db/src/schema/**`, and `packages/db/drizzle/**`
- `docker-compose.dev.yml` and `.env.example`
- current TanStack Start server-function structure under `apps/app/src/server`

## Dependencies

None.

## Scope

- Select and configure one TypeScript test runner compatible with ESM, React 19, and the pnpm
  monorepo. Record the decision in `docs/decisions/`.
- Add root and relevant workspace test scripts with clear unit versus integration behavior.
- Define an isolated PostgreSQL integration-test lifecycle. It must not erase or mutate the normal
  development database and must fail closed if pointed at a non-test database.
- Provide deterministic fixtures for two users, two organizations, memberships, sites, and domains.
- Provide helpers for setup, cleanup, and transaction/schema isolation as appropriate.
- Prove the harness with unit tests for `normalizeHost` and one database-backed tenant fixture test.
- Document local usage and required environment variables in `.env.example`/README as appropriate.
- Ensure tests terminate cleanly and do not leave open pools, servers, watchers, or containers.

## Non-goals

- Implementing authorization guards
- Broad tests of existing features
- CI workflow creation; M0-D1 consumes the commands established here
- Replacing Drizzle, PostgreSQL, Docker Compose, or the application framework

## Ownership

Expected changes include root/workspace manifests, lockfile, test configuration, test helpers,
fixtures, an ADR, and test-specific environment documentation. Coordinate before modifying database
schema or existing migrations; this task should not need a product schema migration.

This packet owns test-runner dependencies and root test script names while active.

## Constraints

- Never reuse `DATABASE_URL` implicitly for destructive test cleanup.
- Require an explicit test database URL and validate a recognizable test-only database name or an
  equally strong isolation mechanism before cleanup.
- Tests must run without production secrets or internet access.
- Keep fixtures tenant-explicit; do not provide helpers that create unscoped tenant records.

## Acceptance criteria

- `pnpm test` (or the documented canonical command) runs once and exits with a useful status.
- Unit-only tests have a fast command that does not require PostgreSQL.
- Integration tests can start from clean state twice in succession without duplicate or leaked data.
- A safety test demonstrates that cleanup refuses a non-test database target.
- Fixtures expose two distinct organizations and prove their records remain distinguishable.
- `normalizeHost` cases cover hostname casing, ports, whitespace, and malformed/edge input currently
  supported by its contract.
- The runner leaves no open handles and repository checks still pass.

## Verification

Run and report:

```bash
pnpm test
pnpm check
pnpm build
```

Also run the unit-only command without PostgreSQL, the integration command twice, and the cleanup
safety case against a deliberately invalid non-test URL without allowing a connection or mutation.

## Handoff

Follow the standard handoff in `docs/agent-tasks/README.md`. Include the test-runner choice and why,
database isolation strategy, canonical commands later packets should use, observed execution time,
and any sandbox/CI requirements M0-D1 must account for.

