# M2-A2 — Site document persistence and legacy backfill

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Depends on: M2-A1

## Outcome

PostgreSQL stores one tenant-scoped mutable draft per site, append-only immutable revisions, an
atomic published-revision pointer, and expiring preview grants without changing current renderer
reads yet. Existing sites receive a migration-authored publication that preserves their legacy
public behavior.

## Scope

- Add `site_document_state`, `site_revision`, and `site_preview_grant` with additive migrations.
- Enforce organization/site/revision agreement through composite keys and constrain revision,
  actor, publication, preview-kind, and expiry states.
- Expose a tenant-scoped repository with no revision update operation.
- Backfill legacy sites idempotently into a draft and first published revision.
- Reject revision updates at the database boundary.
- Verify fresh migration, populated legacy upgrade, retry, and cross-tenant failure behavior.

## Non-goals

- Autosave, publish, rollback, or preview-token application services
- Renderer cutover or legacy-column removal
- Product editor UI

## Acceptance criteria

- Fresh databases migrate successfully and populated `0000/0001` databases preserve legacy content.
- Re-running the legacy backfill creates no duplicate state or revision.
- Cross-tenant site, revision ancestry, pointer, and preview-grant combinations fail through named
  database constraints.
- Published pointers can reference only published revisions; preview grants can reference only
  preview revisions.
- Revisions reject updates and repository reads require both organization and site IDs.
- Integration tests and repository checks/builds pass with no migration drift.

## Follow-up

M2-A3 may now implement authorized draft loading and compare-and-swap autosave. It must validate
documents through `@realtr/site/document` before calling this persistence layer.
