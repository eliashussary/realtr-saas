# M0-E1 — Tenant-safe listing identity migration

- Status: ready
- Milestone: M0 — Safety and delivery foundation

## Outcome

An upstream provider listing identifier can safely exist in multiple organizations, while duplicates
within one organization/provider remain impossible and tested through an upgrade-safe migration.

## Why now

The current unique constraint covers only `source + sourceListingId`. The first tenant to ingest a
shared upstream listing could block or be overwritten by another tenant's sync.

## Required context

- merged M0-C1 integration database strategy
- `packages/db/src/schema/listing.ts`
- `packages/db/drizzle/**` and Drizzle configuration
- `packages/core/src/integrations/sources/types.ts`
- worker sync stub and any listing writes added since this packet was authored

## Dependencies

- M0-C1 accepted

## Scope

- Change listing uniqueness to `organizationId + source + sourceListingId` using a named constraint
  or index that produces understandable diagnostics.
- Generate a new Drizzle migration; do not edit the existing applied migration.
- Inspect existing data implications and make the migration deterministic if duplicate cleanup could
  be required. Do not silently discard conflicting data.
- Add integration regression tests proving the same provider ID can exist in two organizations and
  cannot duplicate within one organization.
- Audit current lookup/upsert code and constrain any applicable lookup by organization.
- Document how future canonical/source-level identity work may evolve without broadening this task.

## Non-goals

- Designing the canonical listing model
- Implementing DDF ingestion or worker persistence
- Adding listing status, media, address, or search fields
- Rewriting historical migrations

## Ownership

This task solely owns the next generated migration while active. Expected changes are listing
schema, generated migration/meta files, and focused integration tests. Do not run another
migration-generating task concurrently.

## Constraints

- Verify both a fresh schema and upgrade from the current migration.
- Preserve all existing listing rows or fail with an explicit documented remediation path.
- Every lookup or conflict target touched by this task must include organization scope.

## Acceptance criteria

- Organization A and B can each store source `ddf` and source listing ID `123`.
- Organization A cannot store that identity twice.
- The generated migration upgrades the current schema and a clean database reaches the same result.
- No existing lookup/upsert touched by the change remains globally scoped.
- Schema, migration snapshot, and tests agree on the constraint.

## Verification

Run focused DB integration tests and:

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @realtr/db check
pnpm check
```

Use disposable databases to verify both fresh migration application and upgrade from the existing
`0000` state. Report how migration drift was checked.

## Handoff

Follow the standard handoff. Include the old/new constraint, data-preservation assessment, fresh and
upgrade migration evidence, and the conflict target future sync code must use.
