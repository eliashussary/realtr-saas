# M2-A12 — Renderer SEO & discovery

**Work package:** M2 (Site builder, templates, and publishing) — "production-grade … metadata,
sitemap, and structured data".

## Outcome

Published sites emit complete discovery metadata: canonical URLs, Open Graph and Twitter card tags,
JSON-LD structured data (WebSite + RealEstateAgent), a per-site `sitemap.xml`, and a `robots.txt`
that points at it. This closes the SEO/metadata portion of M2's block/quality package.

## Why now

The renderer already routed pages, redirects, and 404s and emitted a basic title/description/robots
(M2-A5), and per-page SEO fields are now editable (M2-A10). This turns that data into full,
crawler-facing metadata and discovery endpoints.

## Required context

- `apps/renderer/src/published-site.tsx` — head + render path, host resolution
- `apps/renderer/src/seo.ts` (new) — pure metadata/sitemap/robots builders
- `packages/site/src/site-document.ts` — page `seo` fields and `settings`
- `apps/renderer/src/routes/internal/tls-check.ts` — server-route pattern

## Scope

- `seo.ts`: `resolveOrigin` (honors `x-forwarded-proto`, http for localhost), `buildPageSeo`
  (title/description/robots + canonical + Open Graph + Twitter + JSON-LD), `sitemapXml`, `robotsTxt`,
  and a `<`-escaping JSON-LD serializer.
- `published-site.tsx`: carry the request origin into loader data; head emits meta + canonical link;
  the page renders JSON-LD `<script>` tags.
- `/sitemap.xml` and `/robots.txt` server routes — host-resolved, fail-closed (404 for an
  unknown/unpublished host).
- Renderer test runner (vitest) + `seo.test.ts`.

## Non-goals

- `og:image` / social preview images (no asset pipeline yet — deferred with the asset-storage
  decision).
- Per-page canonical overrides, hreflang/i18n, or a configurable production base URL (M5 host work).

## Ownership

- `apps/renderer/src/seo.ts` (+ `seo.test.ts`), `vitest.config.ts`, `package.json`
- `apps/renderer/src/published-site.tsx`
- `apps/renderer/src/routes/sitemap[.]xml.ts`, `routes/robots[.]txt.ts`

## Acceptance criteria

- Each page emits a canonical URL, Open Graph, Twitter, and (home only) RealEstateAgent JSON-LD;
  noindex pages emit `robots: noindex, nofollow`.
- `sitemap.xml` lists only active, indexable pages as absolute URLs; `robots.txt` references it;
  both are 404 for an unknown/unpublished host.
- JSON-LD cannot break out of its `<script>` tag (`<` escaped), verified by test.
- `check`, `test:unit`, `build`, Biome, and the renderer CSS budget all pass.

## Verification

- `pnpm --filter @realtr/renderer run test:unit` — `seo.test.ts`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`, `node scripts/check-css-budgets.mjs`
- Manual: publish a site, view source for canonical/OG/JSON-LD, and fetch `/sitemap.xml` and
  `/robots.txt`.
