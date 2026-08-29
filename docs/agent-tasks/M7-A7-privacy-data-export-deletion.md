# M7-A7 — Privacy, data export & deletion, DDF launch approval

**Work package:** M7 (Operations, reliability, launch) — the compliance surface: a tenant's right to
access (export) and erase (delete) their data, plus the legal/DDF artifacts needed to launch.

## Outcome

- **Data export (access request):** an owner downloads a full JSON export of their organization —
  org, members, sites, published revisions, domains, integrations (credentials redacted), listings,
  leads, agent profiles, asset metadata, subscription — from **Dashboard → Data & privacy**.
- **Erasure:** an owner permanently deletes their organization (typed-name confirmation); the
  `organization` FK-cascade removes every tenant-scoped row. The action is audit-logged before it runs
  (the audit FK is `ON DELETE SET NULL`, so the trail survives).
- **Compliance docs:** engineering-owned `docs/data-handling.md` (export/retention/erasure behavior,
  incl. the S3-object and Stripe-cancellation follow-ups the DB cascade doesn't cover), and
  `docs/legal/` templates (privacy policy, terms — **flagged for counsel review**) + the CREA **DDF
  launch approval checklist**.

## Scope

- `@realtr/db/data-export` — `exportOrganizationData` (org-scoped gather, credentials redacted) and
  `deleteOrganization` (cascade erasure). + integration test (export scoping, redaction, cascade).
- `apps/app/server/privacy.ts` — `exportMyOrgDataFn`, `deleteMyOrgFn` (owner-only; name confirmation;
  audited).
- `apps/app/routes/_dashboard.privacy.tsx` + sidebar "Data & privacy" entry — export download + delete
  with confirmation.
- `docs/data-handling.md`, `docs/legal/` (README, privacy-policy, terms-of-service, ddf-launch-approval).

## Non-goals / follow-ups

- S3 asset-object purge on erasure (rows cascade; objects need an out-of-band/scheduled cleanup —
  documented).
- Stripe subscription cancellation on erasure (cancel via Portal first — documented).
- Finalizing the legal text (counsel) and completing the DDF business/legal gates.
- Visitor-level (lead) self-service access/deletion — routed through tenant/support for MVP.

## Ownership

- `packages/db/src/data-export.ts` (+ test), `packages/db/package.json` (`./data-export`)
- `apps/app/src/server/privacy.ts`, `apps/app/src/routes/_dashboard.privacy.tsx`,
  `apps/app/src/components/dashboard-sidebar.tsx`
- `docs/data-handling.md`, `docs/legal/*`

## Acceptance criteria

- Owner can export a complete, org-scoped JSON with third-party credentials redacted; no other tenant's
  data appears.
- Owner can erase the org with confirmation; the cascade removes all tenant data and leaves other
  tenants intact; the erasure is audited.
- Export/delete are owner-only (others `forbidden`).
- `check`, `test:unit`, Biome, `build` pass; export/redaction/cascade have an integration test.

## Verification

- `pnpm -r --parallel check`, `pnpm test:unit`, `biome check .`, `pnpm -r build`; DB integration
  (`data-export.integration.test.ts`) under `pnpm test:integration` (Docker Postgres; CI).
