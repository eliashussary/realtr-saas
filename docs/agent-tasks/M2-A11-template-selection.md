# M2-A11 — Template selection & switching

**Work package:** M2 (Site builder, templates, and publishing) — "template selection/switching with
content-compatibility tests".

## Outcome

A realtor can pick from more than one site template and switch between them in the editor without
losing pages, content, or theme. A second template (`classic`) ships alongside `modern`, and a
template picker in the editor switches the live draft; the renderer serves whichever template the
document references.

## Why now

The registry, per-template config, and compatibility-version plumbing already existed but only one
template (`modern`) was installed and there was no way to choose one. Adding a second template and a
switch UI proves the compatibility model end to end and completes the template bullet of M2.

## Required context

- `packages/site/src/registry.ts`, `types.ts` — template registry and `TemplateMeta`
- `packages/site/src/blocks/index.ts` — shared `coreBlocks` / `composeConfig`
- `packages/site/src/templates/modern/*` — the existing template
- `apps/renderer/src/published-site.tsx` — resolves the template by `document.template.id`
- `apps/app/src/routes/sites.$siteId.edit.tsx` — editor config/canvas mounting

## Scope

- Add a `classic` template (Root layout + default theme + default pages) reusing `coreBlocks`.
- Factor the nav-forwarding Puck root render into `templates/shared.ts` and use it in both templates.
- Add a `description` to `TemplateMeta` for the picker.
- Template picker dialog in the editor; switching updates `document.template` (id + schemaVersion),
  rebuilds the Puck config, remounts the canvas, and autosaves. Content and theme are preserved.

## Non-goals

- Template thumbnails/screenshots (uses a text description for now).
- Re-theming on switch (theme stays the customer's; only the layout changes).
- New blocks or renderer SEO output (separate M2 slices).

## Ownership

- `packages/site/src/templates/classic/*` (new), `templates/shared.ts` (new)
- `packages/site/src/registry.ts`, `types.ts`, `templates/modern/index.tsx`
- `packages/site/src/template-switching.test.ts` (new) — compatibility tests
- `apps/app/src/components/template-picker-dialog.tsx` (new)
- `apps/app/src/routes/sites.$siteId.edit.tsx` — template state + wiring

## Acceptance criteria

- At least two templates are selectable; switching keeps pages, block content, and theme.
- Both templates expose the same block set, so any page's content renders under either (verified in
  `template-switching.test.ts`).
- A document whose template is switched in place stays valid against the strict schema.
- The published site renders the referenced template's layout and the managed navigation.
- `check`, `test:unit`, `build`, Biome, and the app/renderer CSS budgets all pass.

## Verification

- `pnpm --filter @realtr/site run test:unit` — `template-switching.test.ts`
- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`, `node scripts/check-css-budgets.mjs`
- Manual: open the editor, switch template, confirm content/menu persist and the layout changes,
  then publish and confirm the live site uses the chosen template.
