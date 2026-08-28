# M2-A10 — Page & navigation management

**Work package:** M2 (Site builder, templates, and publishing) — "page model and routes: named
pages, navigation, SEO fields, slugs, redirects, 404 behavior".

## Outcome

A realtor can manage their site's structure from the control-centre editor: add / rename / delete
pages, set each page's path (slug), status (active/hidden) and per-page SEO (title, description,
noindex), build the navigation menu (page or external-URL items, reorderable), and manage redirects.
The published site renders the managed menu and serves the pages, redirects, and 404s the renderer
already routes.

## Why now

The document schema (M2-A1) already models `pages`, `navigation`, and `redirects`, and the renderer
(M2-A5) already routes by slug with redirects and fail-closed 404s — but nothing but block content
was editable, and the template's menu was hardcoded. This makes the whole page/route model editable
and wires navigation through to the published site.

## Required context

- `packages/site/src/site-document.ts` — pages/navigation/redirects schema, `normalizePageSlug`,
  `resolvePageBySlug`, and the new `resolveNavigation`
- `apps/renderer/src/published-site.tsx` — routing + render path
- `packages/site/src/templates/modern/{index,root}.tsx` — template root + menu
- `apps/app/src/routes/sites.$siteId.edit.tsx` — editor autosave and page mounting

## Scope

- Pages: add, rename, edit slug (slugified), status, and SEO; delete (home page protected; always
  ≥1 page). Page content edited by switching the active page.
- Navigation: flat menu of page/URL items with label, reorder, and remove.
- Redirects: from → to rows with a permanent flag.
- Key the Puck canvas by page id (not array index) so add/delete/reorder are safe.
- Render `document.navigation` in the renderer and modern template; inject it at render time only.
- Value cleaning so the strict document schema always accepts the persisted result.

## Non-goals

- Nested navigation (submenus) — schema supports it; the panel keeps a flat menu for now.
- Drag-and-drop reordering (up/down buttons instead).
- Template switching and new blocks/renderer SEO output (separate M2 slices).

## Ownership

- `apps/app/src/components/site-structure.ts` (+ test) — types + pure `cleanStructure`/helpers
- `apps/app/src/components/pages-nav-dialog.tsx` — the panel UI
- `apps/app/src/routes/sites.$siteId.edit.tsx` — id-keyed pages, structure state, wiring
- `packages/site/src/site-document.ts` (+ `resolve-navigation.test.ts`) — `resolveNavigation`
- `apps/renderer/src/published-site.tsx`, `packages/site/src/templates/modern/*` — render the menu

## Acceptance criteria

- Adding/renaming/deleting/reordering pages, menu items, and redirects persists via CAS autosave and
  survives reload; deleting the active page falls back to the home page.
- A half-typed or invalid entry never produces a schema-invalid draft (verified by round-tripping
  cleaned output through `parseSiteDocument`); navigation to a missing/hidden page and colliding /
  duplicate / self redirects are dropped from the saved document.
- The published site renders the managed menu, resolves slugs, honors redirects, and 404s hidden or
  unknown pages.
- `check`, `test:unit`, `build`, Biome, and the app/renderer CSS budgets all pass.

## Verification

- `pnpm --filter @realtr/app run test:unit` — `site-structure.test.ts`
- `pnpm --filter @realtr/site run test:unit` — `resolve-navigation.test.ts`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`, `node scripts/check-css-budgets.mjs`
- Manual: add a page, set its slug/SEO, add it to the menu, add a redirect, publish, and confirm the
  live site shows the menu and serves the page + redirect.
