# ADR 0005: User-supplied templates — tiered approach, code templates deferred

- Status: Accepted
- Date: 2026-08-28
- Decision owners: product owner and M2 implementers

## Context

Templates today are **code, not data**. A `TemplateModule` (`packages/site/src/types.ts`) exposes a
React `Root` component and a `buildConfig()` that returns a live Puck `Config`, wired in through a
static import registry (`packages/site/src/registry.ts`) that the editor and renderer resolve
synchronously via `getTemplate(id)`. A site references its template as `document.template =
{ id, schemaVersion }`, and the document schema's `superRefine` asserts that `id` exists in the
in-process registry. All installed templates share one block set (`coreBlocks`), which is why
switching templates preserves content (M2-A11).

"Let a user supply their own template" therefore spans a spectrum, from safe data to executing
tenant-authored code inside shared services:

- **Tier 1 — custom starting point (data only):** save a site's pages + theme + navigation as a
  reusable preset; start new sites/pages from it. Pure `SiteDocument` data; no new runtime risk.
- **Tier 2 — configurable layouts (data only):** enumerated layout options (header/footer variants,
  container width, section order, color/type scales) that the template `Root` and renderer honor,
  validated by Zod. No new runtime risk.
- **Tier 3 — true custom templates (code/markup):** either (3a) a constrained, sandboxed markup /
  whitelisted-component format, or (3b) arbitrary React/JS like the internal templates. Both
  introduce tenant-authored rendering into a multi-tenant system.

Tier 3 forces work well beyond UI: process/render isolation (tenant code cannot run in the renderer
process, which holds secrets and every tenant's data), async/data-driven template resolution, a
versioned template-artifact store, a real block-compatibility contract, a build/validation/review
pipeline, preview isolation, per-tenant CSS budgeting, entitlements, and rollback. It also forces
the still-open "deployment target beyond single-host Docker" decision in `docs/EXECUTION_PLAN.md`.

## Decision

Adopt **Tier 1 and Tier 2 as the model for "user-supplied templates," and defer Tier 3 (code or
sandboxed-markup templates) to later in the plan** — after the MVP vertical slice, and only behind
its own ADR.

- Tiers 1–2 are accepted in principle now but **not scheduled for immediate implementation**; they
  are sequenced as later M2 (or post-MVP) slices once the current M2 editing/publishing spine and
  the earlier milestones settle.
- Tier 3 is explicitly **out of the MVP boundary**. If third-party/agency-authored themes are
  pursued, prefer a curated, reviewed package model (Tier 3a) over per-user arbitrary code (3b);
  either requires a dedicated sandboxed render service and a preceding ADR.

## Consequences

- The template contract stays code-authored and registry-resolved for the MVP; no schema or
  deployment-topology change is taken on now.
- When Tiers 1–2 are scheduled, they extend existing data structures (presets are cloned
  `SiteDocument`s; layout options extend the theme/layout schema) and reuse the publish/rollback and
  compatibility machinery already built in M2.
- The block-compatibility guarantee (shared `coreBlocks`, asserted by the M2-A11 switching tests)
  remains the invariant any future template work must preserve.
- `document.template` remains a registry key. A move to tenant-owned template artifacts is a
  breaking reference change that Tier 3's ADR must design (id → versioned artifact reference).

## Follow-up work (unscheduled)

- Tier 1: `site_presets` (org-scoped) + "Save as template" / "Start from template" clone flow.
- Tier 2: layout-options schema + template `Root`/renderer support + editor UI.
- Tier 3 (needs its own ADR): render isolation, template-artifact store/versioning, declared block
  compatibility, build/validation/review pipeline, preview isolation, entitlements, and the
  deployment-topology decision it forces.
