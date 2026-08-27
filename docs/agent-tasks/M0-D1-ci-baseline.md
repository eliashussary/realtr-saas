# M0-D1 — Continuous integration baseline

- Status: blocked on M0-C1 and stable root scripts
- Milestone: M0 — Safety and delivery foundation

## Outcome

Every pull request runs deterministic install, formatting/lint, type/generated-route checks, tests,
production builds, and migration validation with useful failures and no production secrets.

## Why now

Parallel agent work needs an objective merge gate. CI should encode commands already proven locally,
not invent a second test or build lifecycle.

## Required context

- accepted M0-C1 test commands and ADR
- root/workspace manifests and lockfile
- repository host's existing workflow conventions and branch requirements, if any
- Docker/test database strategy
- TanStack route generation and Drizzle migration commands
- current documented issue where `pnpm check` may hang silently; reproduce and resolve or isolate it
  rather than hiding it with a passing timeout

## Dependencies

- M0-C1 accepted
- root check/test/build commands stable
- coordinate with any task actively changing manifests or the lockfile

## Scope

- Add the repository-native pull-request workflow using Node 22 and the pinned pnpm version.
- Use frozen-lockfile installation and safe dependency caching.
- Run Biome, route generation/type checks, unit tests, PostgreSQL integration tests, and production
  builds in a clear job structure.
- Validate that committed generated routes and Drizzle migrations/snapshots are not stale after
  their canonical generation commands.
- Add timeouts and cancellation/concurrency behavior that save resources while surfacing the exact
  hung command as a failure.
- Ensure database services and test environment values are isolated and non-production.
- Document required checks and how to reproduce each locally.
- Keep logs useful without exposing environment secrets or auth/integration values.

## Non-goals

- Deployment/CD
- Production migrations
- Browser visual regression unless M0-G1 has already established a stable command; integrate that
  command only if it is ready and deterministic
- Dependency update automation or broad security scanning
- Changing application behavior to make CI green without separate justification

## Ownership

Expected changes are workflow configuration and narrow script/docs corrections. M0-C1 owns the test
architecture; consume it. M0-G1 owns visual tooling; consume it only after approval. Coordinate all
manifest/lockfile changes.

## Constraints

- No production or long-lived credentials in workflow files, fixtures, artifacts, or logs.
- Do not use `continue-on-error` for required quality gates.
- Generated-file drift checks must fail with an actionable diff.
- Integration database setup must use the M0-C1 safety guard.
- Pin action versions to reviewed stable releases/commit policies appropriate to the repository.

## Acceptance criteria

- A clean checkout passes all required jobs using only documented test values.
- Deliberate lint, type, unit-test, integration-test, build, generated-route drift, and migration drift
  failures are each detected in a controlled validation or documented dry run.
- Repeated CI execution does not depend on state left by a previous run.
- A hanging command times out as a named failure and does not produce a false success.
- Required checks and local equivalents are documented.

## Verification

Run every local equivalent before handoff. Validate workflow syntax with the repository-supported
tooling. If remote workflow execution is available and authorized, provide links/results; otherwise
state that limitation and provide controlled local failure evidence.

## Handoff

Follow the standard handoff. Include the job graph, cache/service strategy, required check names,
local command mapping, drift detection method, secret model, observed timings, and evidence from
deliberate failure cases.

