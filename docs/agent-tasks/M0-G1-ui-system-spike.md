# M0-G1 — UI system validation spike

- Status: ready
- Milestone: M0 — Safety and delivery foundation
- Decision: `docs/decisions/0001-ui-system.md` (accepted stack and surface boundary)

## Outcome

Realtr has a reviewable, isolated implementation of the approved shadcn/Base UI foundation proving
monorepo integration, visual direction, accessibility, and maintainability before product-wide
migration.

## Why now

Most UI will be agent-developed and closely human-reviewed. A small approved reference system gives
fresh agents strong defaults and prevents generic or inconsistent screens from multiplying.

## Required context

- `docs/decisions/0001-ui-system.md`
- existing `packages/ui/**`, all app stylesheet entry points, and workspace manifests
- current dashboard/auth screens in `apps/app`
- `packages/site/**` to understand—but not collapse—the tenant-site visual boundary
- official shadcn monorepo, Tailwind v4, and Base UI documentation current at implementation time

## Dependencies

- ADR 0001 accepted

## Scope

- Configure pinned `components.json` files and package exports/aliases for shadcn monorepo generation
  into `packages/ui`, using `base-nova`, Base UI, Lucide, Tailwind v4, CSS variables, and the accepted
  conventions.
- Reconcile existing Button/Card code intentionally; do not retain duplicate public components with
  ambiguous ownership.
- Implement and refine Button, Field/Input, Select, Dialog, Dropdown Menu, Tooltip, and Toast.
- Define the initial control-centre semantic token set for light and dark themes without changing
  tenant `ThemeTokens` behavior.
- Create an isolated component workbench showing all relevant states, long content, keyboard focus,
  validation, loading, disabled, destructive action, mobile width, and dark mode.
- Compare Storybook or a smaller equivalent for isolated development, automated accessibility, and
  deterministic screenshots. Record the decision and setup only the chosen option.
- Add interaction/accessibility checks and deterministic visual baselines for the spike components.
- Create a representative control-centre form composition and provide before/after screenshots for
  product-owner review without migrating the live screen.
- Record dependency/bundle impact and SSR/hydration behavior under TanStack Start.

## Non-goals

- Migrating existing application screens
- Redesigning public realtor templates
- Building the full three-wave component inventory
- Selecting form-state or data-table architecture based only on shadcn examples
- Adding animation dependencies without a demonstrated interaction need
- Importing unreviewed community registry code

## Ownership

This packet owns `packages/ui` component code, shadcn configuration, UI-related manifest and lockfile
changes, chosen workbench configuration, and spike tests while active. Avoid concurrent dependency/
lockfile work or coordinate it explicitly.

The agent may inspect `packages/site` but must not restyle tenant templates.

## Constraints

- Generated code is reviewed Realtr source; never blindly overwrite customized components.
- Use semantic roles rather than raw color utilities in component implementations.
- Preserve native semantics, visible focus, reduced-motion preferences, and keyboard operation.
- No component may require the application theme to equal a tenant website theme.
- Visual baseline updates require screenshot evidence and explanation.

## Acceptance criteria

- The shadcn CLI can add a disposable/test component to the intended package with correct imports;
  remove the disposable component before handoff.
- All seven required components render in the workbench with documented states and consistent API.
- Keyboard navigation and automated accessibility checks pass for representative interactions.
- Deterministic light/dark and desktop/mobile screenshots are committed or produced through the
  chosen review workflow.
- Existing tenant theme rendering remains unchanged by focused regression evidence.
- No live product screen has been migrated.
- The product owner can review a representative composition, tokens, and before/after evidence and
  give a clear approve/revise decision.

## Verification

Run focused component, interaction, accessibility, and screenshot checks plus:

```bash
pnpm --filter @realtr/ui check
pnpm check
pnpm build
```

Manually inspect every workbench state at agreed widths in current Chrome and one WebKit-based run
if supported by the chosen tooling. Test keyboard-only operation and reduced motion.

## Handoff

Follow the standard handoff. Include screenshots, token summary, component API deviations from
upstream, dependency/bundle impact, workbench decision, accessibility results, SSR findings, and a
list of decisions requiring product-owner visual approval.

