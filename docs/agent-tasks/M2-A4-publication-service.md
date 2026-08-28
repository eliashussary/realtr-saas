# M2-A4 — Publication service

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`
- Depends on: M2-A2, M2-A3

## Outcome

Owners and admins can publish the current draft as an immutable revision and atomically move the
single live pointer, and can roll back to any historical published revision. Both operations lock
the state row, validate the document, and record tenant-scoped audit events. Publishing never
touches the draft version; rollback resets the draft and bumps its version so open editors go stale.

## Scope

- `publishDraft` / `rollbackToRevision` on the `@realtr/db` repository: `FOR UPDATE` lock on the
  state row, immutable published-revision insert, atomic pointer + `nextPublicationNumber` advance,
  and audit insert — all in one transaction.
- `publishSite` / `rollbackSite` in `apps/app/src/server/site-publish.ts`: publish permission
  (`canPublish` = owner/admin), whole-document validation via `@realtr/site/document`, and typed
  outcomes. Rollback validates the target revision and points to a new publication via
  `basedOnRevisionId`.
- Audit actions `site.publish` and `site.rollback` (no document JSON or personal data).

## Typed outcomes

- publish: `{ ok:true, revisionId, publicationNumber, publishedAt }` · `stale` · `invalid` ·
  `forbidden` · `not_found`
- rollback: `{ ok:true, revisionId, publicationNumber, draftVersion }` · `invalid` · `forbidden` ·
  `not_found`

## Non-goals

- Post-commit cache invalidation / outbox and renderer cutover (A5).
- Preview grants (A6) and editor/publish UX (A7).
- Rollback across schema versions: current schema only until a v2 envelope and its migrations exist
  (marked with a `ponytail:` note in `site-publish.ts`).

## Verification

- `pnpm check` (typecheck + Biome) passes; no migration change (reuses A2 tables).
- `pnpm test:integration` — 8 new cases in `packages/db/test/site-publish.integration.test.ts`:
  publish + audit + pointer move, first-publish of a private site, stale publish (pointer
  unchanged), forbidden role, cross-tenant hidden as not_found, corrupt-draft validation failure,
  rollback chain (new publication, draft reset, editor staleness), and rollback to an
  unknown/cross-tenant revision.

## Follow-up

M2-A5 (renderer cutover + cache contract) consumes the published pointer; M2-A6 (secure preview)
and M2-A7 (editor/publish UX) build on these services and their audit trail.
