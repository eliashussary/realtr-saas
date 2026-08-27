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
Because all three web apps currently scan `packages/ui/src`, their generated CSS grows by roughly
32 kB raw: app 12.08 → 44.88 kB, renderer 14.24 → 46.33 kB, and marketing 12.02 → 44.24 kB. This is
acceptable evidence for the spike but not an acceptable silent production cost. Before broad UI
migration, split control-centre component sources/styles from the neutral tenant-facing UI scan or
otherwise constrain Tailwind source discovery, then add CSS budgets to CI.

## Review checkpoint

Product-owner approval is still required for the density, blue primary treatment, radius, dark
surfaces, and representative form composition before any live control-centre screen migration.
The next UI slice should add screenshot automation rather than silently refreshing committed PNGs.
