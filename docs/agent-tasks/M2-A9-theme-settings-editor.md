# M2-A9 — Theme & site settings editor

**Work package:** M2 (Site builder, templates, and publishing) — "theme editor for logo, color,
typography, radius, imagery, and social/contact data".

## Outcome

A realtor can edit their site's brand and theme from the control-centre editor: site title, contact
email/phone, social links, theme colors, heading/body fonts, and corner radius. Edits autosave
through the existing draft API and appear in the live site after publish.

## Why now

The publishing spine (M2-A1…A8) can already version, preview, publish, and render a multi-page site
document whose schema models `settings` (title, logo, contact, social links) and `theme` (colors,
fonts, radius). Until this slice, none of that was editable — `sites.$siteId.edit.tsx` only edited
Puck block content and captured the theme once, read-only (its own comment flagged theme editing as
out of scope). This closes the "theme editor" bullet of M2.

## Required context

- `packages/site/src/site-document.ts` — `settings`/`theme` schema (strict; empty values rejected)
- `packages/ui/src/tokens.ts` — `ThemeTokens` and `themeToCssVars`
- `apps/renderer/src/published-site.tsx` — how the renderer merges + applies theme
- `apps/app/src/server/site-fns.ts` / `site-draft.ts` — CAS autosave contract

## Scope

- Editable UI for `settings.siteTitle`, `settings.contact.{email,phone}`, `settings.socialLinks[]`,
  and `theme.{colors,fonts,radius}`.
- Reuse the editor's existing debounced CAS autosave for settings edits.
- Live theme preview in the canvas, committed on panel close to avoid Puck config churn.
- Value cleaning so the strict document schema always accepts the persisted result.

## Non-goals

- Logo upload — `settings.logoAssetId` is a reference with no asset pipeline yet; deferred to the
  asset-storage decision in the execution plan.
- Page/navigation/redirect management and template switching (separate M2 slices).
- New renderer output (Open Graph, JSON-LD, sitemap) — separate M2 slice.

## Ownership

- `apps/app/src/components/site-settings.ts` (new) — types + pure `cleanBrandingInput`
- `apps/app/src/components/site-settings-dialog.tsx` (new) — the panel UI
- `apps/app/src/components/site-settings.test.ts` (new) — unit tests
- `apps/app/src/routes/sites.$siteId.edit.tsx` — wiring (shared file; header + save path)

## Acceptance criteria

- Theme/brand/contact/social edits persist via CAS autosave and survive reload.
- A cleared or half-typed value never produces a schema-invalid draft (verified by round-tripping
  cleaned output through `parseSiteDocument`).
- Theme edits are reflected in the published site after publish (renderer already applies theme).
- `check`, `test:unit`, `build`, Biome, and the app CSS budget all pass.

## Verification

- `pnpm --filter @realtr/app run test:unit` — `site-settings.test.ts` passes
- `pnpm --filter @realtr/app run check` — typecheck clean
- `pnpm --filter @realtr/app run build` && `node scripts/check-css-budgets.mjs` — within budget
- Manual: open the editor, change brand color / fonts / radius / contact / social links, confirm
  autosave status, reopen to confirm persistence, publish and confirm the live theme changes.
