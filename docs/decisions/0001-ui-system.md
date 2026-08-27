# ADR 0001: UI system for product and tenant sites

- Status: Accepted
- Date: 2026-08-27
- Reviewers: product owner and implementing agent

## Context

Realtr has two visually demanding but distinct surfaces:

1. The control centre is an application: onboarding, forms, tables, site editing, listing sync,
   domains, leads, and billing. It benefits from a broad, consistent accessible component set.
2. Public realtor sites are the customer's brand and product. They must support visibly different,
   editorial-quality templates and cannot inherit a recognizable SaaS component aesthetic.

The repository already uses React 19, Tailwind CSS v4, class-variance-authority, `tailwind-merge`,
and runtime CSS-variable themes. It has hand-written Button and Card primitives but no complete
interaction layer, component catalog, visual regression suite, or formal UI quality bar. Most code
will be agent-generated and human-reviewed, so conventions must make good output easy to produce
and visual drift easy to detect.

## Proposed decision

Adopt **shadcn/ui with the `base-nova` style and Base UI foundation** as the starting point for
Realtr's source-owned UI system. Continue using Tailwind CSS v4 and CSS variables. Generate
components into `packages/ui`, review the generated code, and treat it as Realtr code rather than an
opaque dependency.

This is an investment in a workflow and component contract, not a decision to ship the stock
shadcn appearance unchanged.

### Surface boundary

- `apps/app`, `apps/marketing`, and the future internal `apps/admin` may compose Realtr's full
  application components from `packages/ui`.
- `packages/site` and `apps/renderer` may use neutral primitives and behavior where appropriate,
  but public blocks and templates own their presentation. They must not import control-centre
  composites such as app shells, settings panels, or data tables.
- Keep app-system tokens separate from tenant `ThemeTokens`. A realtor changing their website brand
  must not restyle the control centre, and adding control-centre semantic tokens must not silently
  change published sites.

### Foundation choices

- shadcn style: `base-nova`
- behavior primitives: Base UI
- icon family: Lucide, wrapped where semantic names improve consistency
- styling: Tailwind CSS v4 plus semantic CSS variables in OKLCH
- variants: class-variance-authority for intentional component APIs
- notifications: Sonner through a Realtr-owned wrapper
- motion: CSS first; add Motion for React only for interactions that materially benefit
- forms and tables: choose application libraries separately based on behavior; do not make shadcn
  examples an implicit architecture decision

Use package subpath exports such as `@realtr/ui/components/button` rather than growing a large barrel
that makes ownership and client bundles harder to reason about. Configure `components.json` in the
relevant workspaces so the shadcn CLI installs files and dependencies in the correct monorepo
package. Pin the chosen style, base, icon family, and aliases; agents must not re-run initialization
with different answers.

### Token model

Define semantic tokens before migrating screens. The control-centre system should include at least:

- canvas, surface, elevated surface, foreground, muted foreground, border, input, and focus ring
- primary, secondary, accent, destructive, warning, success, and informational roles, including
  foreground pairings
- a restrained spacing, radius, elevation, typography, and motion scale
- light and dark modes, even if dark mode is not exposed in the first release

Components consume semantic roles, not raw palette utilities. Brand color is used deliberately and
must not substitute for status semantics. Tenant-site tokens remain versioned in `ThemeTokens` and
should grow into roles such as surface and on-color pairings rather than a flat set of five colors.

### Initial component investment

Build and approve components in three waves:

1. Foundations: Button, IconButton, Link, Input, Textarea, Label, Field, Select, Checkbox, Radio,
   Switch, Badge, Separator, Skeleton, Spinner, and typography.
2. Overlays/navigation: Dialog, AlertDialog, Sheet, DropdownMenu, Popover, Tooltip, Tabs, Breadcrumb,
   Command/Combobox, Toast, and application shell/navigation.
3. Product patterns: FormSection, EmptyState, ErrorState, PageHeader, DataTable, FilterBar,
   SaveStatus, PublishBar, DomainStatus, IntegrationStatus, ListingCard, and image/asset picker.

The third wave is where Realtr develops a distinct product voice. Those patterns should be designed
from actual product flows, not copied wholesale from a public registry.

### Visual quality workflow

- Maintain a component workbench with every state: default, hover/focus where representable,
  disabled, loading, invalid, empty, long content, and destructive variants.
- Add automated accessibility checks and keyboard-interaction tests for primitives and critical
  flows.
- Capture deterministic visual baselines at agreed desktop/mobile widths and light/dark themes.
  Pull requests with intentional visual changes include before/after images.
- Test public template blocks separately across representative tenant themes, long realtor names,
  missing imagery, extreme listing prices, and mobile layouts.
- Use a small set of reference screens as a visual bar. Agent prompts should cite existing approved
  components and tokens instead of inventing new shadows, radii, colors, or spacing per feature.
- New variants require a demonstrated product use case. Prefer composition over boolean-prop
  matrices and one-off class overrides.

The workbench can be Storybook or an equivalent isolated route/build. The M0-G1 spike must compare
maintenance cost, TanStack Start compatibility, accessibility integration, and screenshot testing
before locking that tooling choice.

## Why this is worth investing in

- shadcn supplies broad, agent-legible examples and CLI/monorepo support while leaving all shipped
  source code available for detailed review and refinement.
- Base UI supplies accessible interaction behavior without imposing presentation, which suits both
  the application and template system.
- The existing Tailwind v4 and CSS-variable setup remains useful; this is an incremental adoption,
  not a rewrite.
- Source ownership avoids waiting for a framework to expose the exact variants or polish required.
- The workbench and screenshot gates turn subjective polish into a repeatable review surface,
  especially important when many agents contribute.

## Alternatives considered

### Mantine or Chakra UI

These offer coherent, productive component APIs, but their runtime/styling conventions and visual
defaults would compete with the current Tailwind/token architecture. Deep customization tends to
become framework-specific, and source-level control is weaker. They are reasonable for an internal
tool where distinct visual authorship matters less, but not the best long-term centre of this
product.

### Radix Primitives plus fully custom components

This gives excellent control and mature accessibility behavior, but requires more initial design
system implementation. shadcn provides the missing acceleration while still allowing generated
components to be changed. Base UI is the proposed primitive because it is now shadcn's default for
new work; Radix remains a viable fallback if the spike exposes a compatibility issue.

### Base UI without shadcn

This has the same behavior advantages but gives agents fewer approved styled patterns and leaves
more boilerplate to invent. It is appropriate for bespoke public-site interactions, not the fastest
way to build the entire control centre.

### A commercial Tailwind kit

A kit can accelerate selected layouts but should not become the component contract. Licensing,
update provenance, inconsistent accessibility, and copied visual language are risks. Approved kits
may be used as design references or reviewed source inputs later.

## Consequences

- Generated code is ours to maintain; upstream updates are deliberate ports, not blind overwrites.
- Stock components require a visual refinement pass before product-wide adoption.
- The UI package needs clear application-versus-public boundaries and more semantic tokens.
- Visual regression artifacts become a routine part of review and CI.
- Community registry items are untrusted source: review licensing, dependencies, accessibility,
  responsiveness, and code before adoption.

## Validation spike and acceptance criteria

Before changing product screens, M0-G1 should:

1. Configure shadcn monorepo aliases and Tailwind v4 paths without replacing existing tenant theme
   behavior.
2. Implement Button, Field/Input, Select, Dialog, Dropdown Menu, Tooltip, and Toast in
   `packages/ui`, including loading/error/disabled states used by Realtr.
3. Demonstrate the components in an isolated workbench at desktop/mobile sizes and light/dark
   themes.
4. Verify keyboard navigation, focus visibility, accessible names/descriptions, and automated
   accessibility results.
5. Produce before/after screenshots of one representative control-centre form, but leave migration
   out of the spike.
6. Record bundle impact, dependency additions, any SSR/hydration issues, and the recommended
   workbench/visual-test tooling.

The stack and surface boundary are approved. M0-G1 remains a visual implementation checkpoint: the
product owner reviews the resulting tokens, representative components, and screenshot evidence
before agents migrate product screens at scale.
