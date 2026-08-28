# M3-A6 — Public listing rendering + attribution

**Work package:** M3 (Listings and REALTOR.ca DDF) — "listing grid/detail/search/filter routes,
canonical URLs, SEO/structured data, attribution, and empty/error states".

## Outcome

Synced listings are shown on the published tenant site: a `/listings` grid and `/listings/{id}`
detail, rendered in the tenant's themed template shell, with canonical URLs, Open Graph, JSON-LD, and
the mandatory REALTOR.ca DDF attribution on every listing display. Empty/not-found/error states are
handled and fail-closed.

## Why now

The full sync path (A1–A6a) now populates a tenant's listings. This is the last MVP piece — making
them publicly visible — and it carries the DDF display/attribution compliance gates.

## Scope

- `@realtr/db`: `getActiveListing`; `@realtr/core`: `listPublishedListings` / `getPublishedListing`
  (tenant-scoped reads), plus `organizationId` on `resolvePublishedSite`.
- Renderer: a pure `toListingView` normalizer (price/address/facts/photos, defensive); `SiteShell`
  (themed template Root + nav for non-Puck pages); grid + detail components; `ListingAttribution`
  (Powered by REALTOR.ca, listing brokerage, MLS®/REALTOR® trademark text; source-URL images so
  watermarks are preserved).
- Routes `/listings` and `/listings/$listingId` with host-resolved loaders (fail-closed 404/503),
  canonical + OG head, and `Residence` JSON-LD on detail.

## Non-goals

- Search/filter UI (grid lists most-recent; National-Pool objective-only filters come with feed-type
  handling later).
- The official "Powered by REALTOR.ca" brand asset — a text mark is a placeholder; the approved logo
  must be swapped before launch (gated in the M3-D1 brief).
- Image proxy/optimization (source URLs only, per the brief) and the `ListingGrid` Puck block wiring
  to live data (follow-up).

## Ownership

- `packages/db/src/listings.ts`, `packages/core/src/{listings.ts,published.ts,index.ts}`
- `apps/renderer/src/{listing-view.ts,site-shell.tsx,listings-render.tsx,listings-data.tsx}` (+ test)
- `apps/renderer/src/routes/listings.index.tsx`, `listings.$listingId.tsx`

## Acceptance criteria

- `/listings` shows the tenant's active listings (empty state when none); `/listings/{id}` shows one,
  404 for unknown/removed; both are host-resolved and fail-closed.
- Every listing display carries attribution + trademark text; images use source URLs (watermarks
  preserved).
- Detail emits canonical, OG, and JSON-LD; the view model tolerates missing fields (tested).
- `check`, `test:unit`, Biome, `build`, and the renderer CSS budget pass.

## Verification

- `pnpm --filter @realtr/renderer run test:unit` (`listing-view.test.ts`)
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`, `node scripts/check-css-budgets.mjs`
- Manual (needs synced listings): view `/listings` and a detail page on a published tenant host.
