# M0-G1 UI system spike evidence

Date: 2026-08-27

## Outcome

The control-centre UI foundation uses shadcn's current `base-nova` configuration with Base UI,
Lucide, Tailwind v4, and source-owned components in `packages/ui`. The shadcn CLI was validated in a
disposable Vite project and then used against `packages/ui`; existing customized components were
reviewed rather than blindly replaced.

The isolated `/workbench` route demonstrates Button, Field/Input, Select, Dialog, Dropdown Menu,
Tooltip, and Toast without migrating a live product screen. The route includes default, secondary,
outline, ghost, destructive, disabled, loading, invalid, long-content, mobile, light, and dark
states plus a representative realtor-profile form.

## Workbench and test decision

Use an isolated TanStack Start route plus Vitest accessibility tests and committed browser
screenshots for the spike. Storybook would add a second Vite configuration, dependency graph, and
deployment surface before the component inventory is stable. Reconsider Storybook when there are
enough product patterns to justify searchable documentation and per-story interaction tests.

Automated axe checks cover representative buttons and valid/invalid fields. The jsdom run disables
axe's color-contrast rule because canvas color evaluation is unavailable there; contrast is reviewed
in the deterministic browser baselines. Browser checks covered menu/select keyboard opening,
Escape dismissal, dialog focus trapping/dismissal, mobile wrapping, and light/dark switching.

## Visual baselines

- `docs/ui-baselines/workbench-desktop-light.png` — 1440 × 1000
- `docs/ui-baselines/workbench-desktop-dark.png` — 1440 × 1000
- `docs/ui-baselines/workbench-mobile-light.png` — 390 × 844
- `docs/ui-baselines/workbench-mobile-dark.png` — 390 × 844

The browser pass caught two defects before review: a generated Base UI menu label crashed outside a
menu group, and the original dark token fallback produced insufficient foreground contrast. The
wrapper and app-token fallback chain were corrected before regenerating the baselines.

## Tokens and surface boundary

App semantic variables cover canvas, surface/elevated surface, foreground, muted foreground,
border, input, ring, primary, secondary, accent, destructive, warning, success, and information
roles. They activate only inside `.realtr-app`. Existing public-site `--t-*` variables remain the
fallback everywhere else, so tenant `ThemeTokens` and renderer output are not redefined.

## Dependencies and runtime findings

The UI package adds tree-shakable `@base-ui/react`, Lucide, Sonner, and shadcn-generated wrappers.
Vitest, Testing Library, jsdom, and vitest-axe are development-only. The workbench imports these
components through package subpaths to preserve bundle splitting. TanStack Start SSR and hydration
complete without new browser errors; Base UI portals render correctly inside the workbench's
isolated stacking context.

The production build reports a route-isolated workbench client chunk of 219.47 kB (71.04 kB gzip).
Tailwind source discovery is scoped by product surface: the control centre scans `packages/ui/src`,
the renderer scans `packages/site/src`, and marketing scans only its own application sources. This
keeps the component spike from adding roughly 32 kB of unused raw CSS to each public app. CI checks
the generated stylesheet against explicit raw-byte budgets (50 kB app, 20 kB renderer, 18 kB
marketing) after every production build.

## Review checkpoint

Product-owner approval is still required for the density, blue primary treatment, radius, dark
surfaces, and representative form composition before any live control-centre screen migration.
The next UI slice should add screenshot automation rather than silently refreshing committed PNGs.
