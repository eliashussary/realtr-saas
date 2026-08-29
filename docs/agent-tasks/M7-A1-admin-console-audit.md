# M7-A1 — Admin operations console + audit log

**Work package:** M7 (Operations, reliability, launch) — the operator surface: one place to see every
tenant's health and act on it, with an accountable audit trail behind privileged actions.

## Outcome

A super-admin can, from the "Operations console":

- **Tenant health board** — one consolidated row per tenant: subscription status/plan, member count,
  custom-domain count + worst status, DDF/CRM connection, active listings, lead count + undelivered
  leads, and last sync. Colour-dot flags surface what needs attention at a glance.
- **Existing levers** (DDF sync trigger/reconcile/pause, billing reconciliation + extend-grace) are
  unchanged but now **audit-logged**.
- **Audit log** — the most recent privileged operator actions (actor email, action, target tenant,
  detail, timestamp), newest first.

## Scope

- `@realtr/db` schema `admin-audit.ts` — `admin_audit_event` table (migration 0015): append-only
  platform audit trail (actor email, action slug, target org, jsonb detail, createdAt). Distinct from
  the tenant-scoped `siteAuditEvent`.
- `@realtr/db/admin` — `recordAdminAudit`, `listAdminAudit` (joined to org), and `listTenantHealth`
  (per-tenant consolidated summary; small scoped queries per org — fine for the pilot operator cohort,
  documented to revisit at scale).
- `apps/app/server/super-admin.ts` — `currentSuperAdminEmail()` for audit attribution.
- `apps/app/server/admin.ts` — `adminListTenantsFn`, `adminListAuditFn`; `recordAdminAudit` wired into
  `adminSyncFn` (`sync.trigger`), `adminSetPausedFn` (`sync.pause`/`sync.resume`), `adminExtendGraceFn`
  (`billing.extend_grace`).
- `apps/app/routes/_dashboard.admin.tsx` — Tenants board (top) + Audit log (bottom) sections.

## Non-goals (later M7 packets)

- Per-tenant drill-down levers: domain re-verify/detach, run-lead-delivery-now, schedule management
  (M7-A2).
- Structured logging / request+job correlation / error reporting / dashboards (M7-A3).
- Backups + restore drills, migration/rollback runbooks, secret rotation, incident procedures (A4);
  security review (A5); a11y/perf/load (A6); privacy/terms/data-export+deletion + DDF launch (A7).

## Ownership

- `packages/db/src/schema/admin-audit.ts`, `packages/db/src/schema/index.ts`,
  `packages/db/src/admin.ts`, `packages/db/drizzle/0015_*.sql`, `packages/db/package.json` (`./admin`)
- `packages/db/test/admin.integration.test.ts`
- `apps/app/src/server/{admin,super-admin}.ts`, `apps/app/src/routes/_dashboard.admin.tsx`

## Acceptance criteria

- Every privileged super-admin mutation writes an audit row (actor, action, target, detail).
- The tenant board shows accurate subscription / domain / integration / listing / lead / sync figures
  per tenant; undelivered leads and failed syncs are flagged.
- All admin reads/actions are super-admin-gated; non-admins get `forbidden`.
- `check`, `test:unit`, Biome, `build` pass; the audit + tenant-health reads have an integration test.

## Verification

- `pnpm -r --parallel check`, `pnpm test:unit`, `biome check .`, `pnpm -r build`; DB integration
  (`admin.integration.test.ts`) under `pnpm test:integration` (Docker Postgres; CI). Migration 0015
  applies via `drizzle-kit migrate` on deploy.
