# M2-A6 — Secure preview grants and routes

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`
- Depends on: M2-A2, M2-A3

## Outcome

An authorized member can mint a shareable preview link for the current draft. Issuing snapshots the
validated draft as an immutable `preview` revision and stores only a SHA-256 hash of a 256-bit
token. The public renderer resolves the raw token to that exact revision and renders it with
`no-store`/`noindex` headers, so a preview cannot be cached, indexed, or drift mid-session. Grants
expire after 30 minutes and can be revoked.

## Scope

- Repository (`@realtr/db`): `createPreviewGrant` (preview revision + grant in one transaction),
  `resolvePreviewGrant` (hash lookup with revocation/expiry enforcement + `lastUsedAt`),
  `revokePreviewGrant` (tenant-scoped).
- App (`apps/app/src/server/site-preview.ts`): `issuePreview` (validate current draft, mint token,
  audit `site.preview.issue`) and `revokePreview` (audit `site.preview.revoke`), with typed
  stale/invalid/not_found outcomes. Any authorized member may preview.
- Core (`@realtr/core`): `resolvePreview` hashes the raw token and returns the revision document, or
  null.
- Renderer (`apps/renderer/src/routes/preview.$token.tsx`): token path route rendering the revision
  through the shared template registry, with `Cache-Control: private, no-store`, `Pragma: no-cache`,
  `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, and a generic 404.

## Non-goals

- Per-view audit-event rows (access recorded via `lastUsedAt`) and expired-revision retention/GC.
- Multipage preview routing (renders the home page for MVP); full multipage lands with A5/A7.
- Editor UI for issuing/copying/revoking links (A7).

## Security ceiling

Token entropy is 256 bits and only its hash is stored, so enumeration is infeasible. A dedicated
per-token rate limiter is deferred to the edge (Caddy); noted here rather than built as a weak
in-process limiter. `ponytail: rely on token entropy; add edge rate-limit before GA.`

## Verification

- `pnpm check` (typecheck + Biome) and `pnpm build` pass (renderer emits the `preview.$token` route).
- `pnpm test:integration` — 5 new cases in `packages/db/test/site-preview.integration.test.ts`:
  issue + resolve + audit + `lastUsedAt`, unknown/expired/revoked tokens return null, stale draft
  refusal, cross-tenant issue/revoke hidden as not_found, and non-admin member can issue.

## Follow-up

M2-A5 (renderer cutover) generalizes the revision render path from preview-only to host-based public
serving with the cache contract; M2-A7 adds the editor preview/publish UX on top of these services.
