# M2-D1 — Draft and publish architecture decision

- Status: ready
- Milestone: M2 — Site builder, templates, and publishing
- Type: architecture decision; no feature implementation

## Outcome

An ADR defines how Realtr stores, edits, previews, publishes, versions, rolls back, and renders site
documents without allowing incomplete edits or stale writers to damage a live site.

## Why now

The current `site.pages` JSON stores one implicit state. Editor, multi-page routing, template work,
preview, caching, and publishing all depend on a stable document lifecycle.

## Required context

- `AGENTS.md` site/template invariants
- M2 in `docs/EXECUTION_PLAN.md`
- `packages/db/src/schema/site.ts`
- all of `packages/site/src/**`
- `apps/renderer/src/routes/**`
- current onboarding/site creation in `apps/app/src/server/tenant.ts`
- Puck's current persisted `Data` contract and editor/render APIs from official documentation
- M0-A1 authorization direction if merged; otherwise state authorization assumptions explicitly

## Dependencies

No code dependency. Coordinate assumptions with M0-A1 if it is active.

## Scope

- Describe the current document lifecycle and failure modes.
- Decide storage boundaries among site settings, navigation, page metadata, page Puck data, theme,
  draft revisions, and published revisions.
- Define stable IDs, slugs, revision/version identifiers, timestamps, authorship, and schema version.
- Define optimistic concurrency and the exact stale-write response/recovery experience.
- Define autosave, explicit publish, atomic multi-page publication, rollback, and revision retention.
- Define secure preview semantics, including token scope/expiry and how preview bypasses caches without
  exposing drafts.
- Define renderer reads, caching/invalidation, unavailable/corrupt revision behavior, and the rule
  that live sites serve the last valid published revision.
- Define template-switch preview and content-compatibility/migration behavior.
- Include a staged migration from existing `site.theme`/`site.pages` seed and onboarding data.
- Compare at least two credible models and explain tradeoffs in query complexity, write safety,
  operational recovery, storage growth, and future collaboration.
- Break the decision into bounded implementation packets with dependency order.

## Non-goals

- Implementing schema, migrations, editor UI, or renderer changes
- Designing every page/block field
- Choosing the asset storage provider
- Real-time multi-user collaborative editing for MVP
- Conflating tenant theme tokens with the control-centre UI theme

## Ownership

Create one ADR under `docs/decisions/` and update plan/task references only as needed. Do not modify
production code, schemas, migrations, manifests, generated files, or lockfiles.

## Constraints

- Draft content must never become public through an ordinary renderer request.
- Publish must be atomic from the public site's perspective.
- Stale clients may not silently overwrite newer content.
- Rollback itself creates an auditable new publication state; do not rewrite history.
- Design for one active editor initially without preventing later collaboration.
- Preserve content when templates switch wherever block contracts remain compatible.

## Acceptance criteria

- The ADR has context, decision, alternatives, consequences, migration, failure behavior, and
  implementation slices.
- It includes concrete schema/table sketches and read/write sequences detailed enough for fresh
  agents to implement without re-deciding architecture.
- Concurrency, partial publish failure, corrupt draft, missing published revision, rollback, preview
  leakage, and cache invalidation are each addressed.
- Existing seeded and onboarded sites have a safe migration path.
- Open product decisions are isolated and presented for product-owner approval.

## Verification

Walk the decision through these scenarios: first site creation, autosave, stale tab save, preview,
first publish, multi-page update, failed publish, rollback, template switch, and renderer request
during publication. Confirm each has one deterministic source of truth and recovery path.

## Handoff

Follow the standard handoff adapted for an ADR. Include the recommended model, rejected alternatives,
schema sketch, sequence summary, migration path, implementation packets, risks, and explicit product
decisions still needing approval.

