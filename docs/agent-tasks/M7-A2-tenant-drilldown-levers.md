# M7-A2 — Per-tenant drill-down levers

**Work package:** M7 (Operations) — the actions the tenant health board points at, so an operator can
resolve what the board flags without touching the database.

## Outcome

Each tenant row in the Operations console expands to a **Manage** panel with audited levers:

- **Custom domains** — list a tenant's domains with status; **Re-verify** (re-run DNS verification now)
  and **Detach** (terminal; stops serving + cert issuance, tenant re-adds to redo).
- **Retry failed lead deliveries** — re-queue all `failed` leads for the tenant to `pending` so the
  next worker sweep re-attempts CRM delivery / notification; reports the count.
- **Pause / Resume sync** — the existing DDF schedule lever, surfaced in the drill-down.

Every action writes an `admin_audit_event` (`domain.reverify`, `domain.detach`, `leads.retry_failed`,
`sync.pause`/`sync.resume`), so the audit log shows exactly what was done to which tenant.

## Scope

- `@realtr/db/admin` — `listDomainsForOrg`, `adminFindDomain` (org-scoped lookup via site),
  `adminSetDomainStatus` (org-guarded status write, backs Detach).
- `@realtr/db/leads` — `retryFailedDeliveriesForOrg` (bulk `failed` → `pending`, returns count).
- `apps/app/server/admin.ts` — `adminListTenantDomainsFn`, `adminReverifyDomainFn` (reuses
  `runDomainVerification` + `nodeDnsResolver`), `adminDetachDomainFn`, `adminRetryLeadsFn`; all
  super-admin-gated and audited.
- `apps/app/routes/_dashboard.admin.tsx` — expandable tenant row → levers panel (domains lazy-loaded
  on expand; detach confirms first).

## Non-goals (later M7)

- Impersonation / editing tenant content (super admin stays ops-only).
- A3 structured logging / correlation / error reporting; A4 backups + runbooks; A5 security review;
  A6 a11y/perf/load; A7 privacy/legal + DDF launch approval.

## Ownership

- `packages/db/src/admin.ts`, `packages/db/src/leads.ts`
- `apps/app/src/server/admin.ts`, `apps/app/src/routes/_dashboard.admin.tsx`

## Acceptance criteria

- Re-verify transitions the domain and reflects the new status; Detach sets `detached` only for a
  domain that belongs to the target org; both are audited.
- Retry re-queues exactly the tenant's `failed` leads and reports the count; audited.
- All levers are super-admin-gated (non-admins `forbidden`) and org-scoped (no cross-tenant mutation).
- `check`, `test:unit`, Biome, `build` pass.

## Verification

- `pnpm -r --parallel check`, `pnpm test:unit`, `biome check .`, `pnpm -r build`. The org-scoped
  domain/lead writes are covered structurally by the M7-A1 admin integration test harness; behavior is
  exercised through the existing domain-verification and lead-delivery integration suites.
