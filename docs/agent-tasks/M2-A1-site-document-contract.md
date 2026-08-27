# M2-A1 — Site document contract and compatibility

- Status: done
- Milestone: M2 — Site builder, templates, and publishing
- Decision: `docs/decisions/0004-draft-publish-site-documents.md`

## Outcome

`packages/site` owns a browser-safe, versioned whole-site document contract, exposed through the
intentional `@realtr/site/document` subpath, that both the future editor and renderer can consume
before any persistence migration is introduced.

## Dependencies

- ADR 0004 accepted
- M0-A1 authorization contract merged (required by later persistence/API packets, not this package)

## Scope

- Define and export the V1 envelope for settings, theme, navigation, pages, Puck data, and redirects.
- Validate known block contracts, template compatibility, stable IDs, page references, URLs, theme
  values, canonical slugs, recursion depth, and document size at the package boundary.
- Provide pure document and template/block compatibility migration seams.
- Convert the existing legacy `templateId`/`theme`/`pages` shape with caller-provided server IDs.
- Add fixture tests for valid conversion and negative compatibility/security cases.

## Non-goals

- Database schema, migration, or backfill
- Authenticated draft APIs, autosave, preview, publication, caching, or editor UI
- A second template or breaking changes to existing block content contracts

## Acceptance criteria

- Legacy modern-template content converts to a valid V1 envelope without losing Puck block IDs.
- Unknown blocks/template versions and missing migration steps fail safely.
- Duplicate IDs, dangling references, unsafe URLs/CSS, invalid/reserved slugs, excessive nesting, and
  oversized documents are rejected.
- The package has focused unit tests and passes repository checks/builds.

## Follow-up

M2-A2 may add tenant-scoped document state, immutable revisions, preview grants, and an idempotent
legacy backfill once this packet is approved.
