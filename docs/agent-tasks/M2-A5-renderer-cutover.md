# M2-A5 — Renderer cutover and cache contract

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`
- Depends on: M2-A2, M2-A4

## Outcome

The public renderer serves the live published revision resolved from the request host, not the
mutable legacy `site.theme`/`pages` columns. It routes multiple pages by slug, follows redirects,
returns a proper 404 for unknown pages, and fails closed: an unknown/unservable host or an
unpublished site is a 404, and a set pointer whose revision is unreadable is a 503 — never a draft
or template default.

## Scope

- `@realtr/site`: pure `resolvePageBySlug(document, path)` → page / redirect / not_found (active
  pages only; normalizes the incoming path).
- `@realtr/core`: `resolvePublishedSite(host)` → `ok | not_found | error`, joining a servable domain
  to `site_document_state.publishedRevisionId` and its revision, tenant-scoped.
- `apps/renderer`: `published-site.tsx` server loader sets fail-closed status codes, a
  revision-derived `ETag`, and `Cache-Control`, and throws router redirects. Home route (`/`) and a
  splat route (`/$`) render through the shared template registry; `head` emits SEO title/description
  and `noindex` for pages marked so.

## Greenfield deviation

The ADR describes a transitional legacy-fallback flag during production migration. This is
greenfield with no production data, so the renderer cuts directly to the revision path (A8 would only
delete that flag). Legacy columns remain dual-written by onboarding and are dropped in A8; the
renderer simply no longer reads them.

## Non-goals / ceilings

- In-process host-mapping and revision caches + invalidation outbox: deferred until load justifies
  them. `ETag` + `Cache-Control` give revision-keyed conditional caching now.
  `ponytail: no in-memory cache yet; ETag + edge revalidation until load appears.`
- Manual `304 Not Modified` handling (left to the edge/CDN via ETag).
- Legacy column removal (A8).

## Verification

- `pnpm check` (typecheck + Biome), `pnpm build` pass (renderer emits home + splat + preview routes).
- `pnpm test:unit` — 5 new cases for `resolvePageBySlug` (home, active, hidden→404, redirect,
  unknown/un-normalizable).
- `pnpm test:integration` — 4 new cases in `packages/db/test/published-site.integration.test.ts`:
  servable host → published revision with tenant isolation, unknown host → not_found, unpublished
  site → not_found, non-servable domain state → not_found.

## Follow-up

M2-A7 adds the editor/publish UX. M2-A8 removes the legacy columns and dual-write once a rollback
window is approved. A cache/invalidation layer can be added behind the immutable revision contract
when traffic warrants it.
