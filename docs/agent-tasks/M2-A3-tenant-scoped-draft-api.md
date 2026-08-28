# M2-A3 — Tenant-scoped draft API

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`
- Depends on: M2-A1, M2-A2, M0-A1

## Outcome

The control centre can load an authorized site draft and autosave it with compare-and-swap
concurrency. Saves validate the whole `SiteDocumentV1` before persistence, return typed outcomes,
and write tenant-scoped audit events. New-site onboarding now provisions the org, site, and its
private draft state in one transaction.

## Scope

- `loadSiteDraft` / `saveSiteDraft` in `apps/app/src/server/site-draft.ts` consuming the M0-A1
  authorization contract; cross-tenant and absent sites return an indistinguishable `not_found`.
- Compare-and-swap `saveDraft` on the `@realtr/db` repository: conditional `draftVersion` update plus
  audit insert in one transaction. Validation stays in `@realtr/site/document`, so the db package
  remains a leaf.
- `site_audit_event` table (additive migration `0004`) with a composite organization/site foreign
  key. Save events are `site_draft.save`; deliberate overrides are `site_draft.override`.
- Atomic onboarding in `apps/app/src/server/onboarding.ts`; the seed gives the demo site document
  state via the existing idempotent backfill.

## Typed outcomes

- `{ ok: true, draftVersion, savedAt }`
- `{ ok: false, code: "stale", currentDraftVersion }`
- `{ ok: false, code: "invalid", issues }` (structured validation paths)
- `{ ok: false, code: "not_found" }` (missing or cross-tenant, indistinguishable)

## Non-goals

- HTTP transport / `createServerFn` wiring for the editor (A7 owns it, coupled to the Puck save
  cadence and its serialization).
- Publish, rollback, preview grants (A4/A6).
- Request-ID save idempotency; CAS versioning already prevents double-apply damage.
- Auditing routine stale 409s (noise); only successful saves and overrides are recorded.

## Verification

- `pnpm check` (typecheck + Biome) passes.
- `pnpm test:integration` — 7 new cases in `packages/db/test/site-draft.integration.test.ts`:
  authorized load, cross-tenant/missing hiding, CAS advance + audit, stale concurrent edit,
  override audit, structured invalid failure, no cross-tenant save, atomic onboarding.
- `pnpm test:unit` passes; no migration drift (`db:generate` is a no-op after `0004`).

## Follow-up

M2-A4 (publication service) can build on the repository's revision writes and the audit table.
A7 adds the editor UI and the server-function transport that calls `loadSiteDraft`/`saveSiteDraft`.
