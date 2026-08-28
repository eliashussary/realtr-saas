# M2-A7 — Editor and publishing UI

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`; ADR 0001 (UI system, approved)
- Depends on: M2-A3, M2-A4, M2-A6, M0-G1 (approved)

## Outcome

The control centre has a working site editor: load the tenant draft, edit a page in Puck, autosave
with compare-and-swap concurrency and visible save states, switch between pages, and publish or
preview from a toolbar. It consumes the A3/A4/A6 services through a thin server-function transport.

## Scope

- Server-function transport `apps/app/src/server/site-fns.ts` wrapping the pure A3/A4/A6 functions:
  `loadSiteDraftFn`, `saveSiteDraftFn`, `publishSiteFn`, `rollbackSiteFn`, `issuePreviewFn`,
  `revokePreviewFn`. Converts `bigint`↔string and casts the document to a JSON type so TanStack
  serialization accepts it. `issuePreviewFn` returns a ready preview URL on the tenant renderer host.
- Editor route `apps/app/src/routes/sites.$siteId.edit.tsx`: Puck editor (client-gated), debounced
  CAS autosave, save-state badge (idle/saving/saved/conflict/invalid/error), a conflict banner with
  reload, a page switcher for multipage docs, Preview (opens an immutable snapshot), and a
  Publish confirmation dialog (owner/admin only). Unauthenticated deep-links redirect to `/login`.
- Dashboard "Edit site" link into the editor.

## Non-goals / follow-ups

- Rollback UI (needs a revision-history list) — service exists (`rollbackSiteFn`), UI deferred.
- Template-switch compatibility reporting and structured field-level validation surfacing.
- Preview link management UI (revoke/list) — `revokePreviewFn` exists, UI deferred.
- Responsive-preview toggle beyond Puck's built-in viewport controls.
- Request-ID autosave idempotency (CAS already prevents double-apply).

## Verification

- `pnpm check` (typecheck + Biome) and `pnpm build` pass; the editor route and Puck bundle cleanly.
- Browser-verified: unauthenticated deep-link redirects to `/login`; app renders under the approved
  Shopify Red theme (tokens now on `<html>`).
- Backend behavior is covered by the A3/A4/A6 integration suites (37 tests). A logged-in
  edit→autosave→publish→preview smoke is left as a manual check (requires the dev magic-link login).

## Follow-up

Rollback/history UI, template-switch reporting, and preview-link management are the natural next
editor slices. M2-A8 removes the legacy `site.theme`/`pages` columns and dual-write.
