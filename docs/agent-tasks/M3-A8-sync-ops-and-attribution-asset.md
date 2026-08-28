# M3-A8 — Sync operations (manual sync, super-admin console) + official attribution asset

**Work package:** M3 (Listings and REALTOR.ca DDF) — operational controls + the "manual sync,
concurrency/rate controls, health UI" bullet; and the M3-A6 attribution asset.

## Outcome

- Manual "Sync now" / "Reconcile" for the current tenant (immediate, returns counts) — makes testing
  a real key fast without waiting for the schedule.
- A super-admin `/admin` console (platform role via `SUPER_ADMIN_EMAILS`) listing every tenant's DDF
  integration health, with per-tenant trigger-sync and pause/resume.
- The official CREA "Powered by REALTOR.ca" logo replaces the text placeholder in listing attribution
  (sourced from the production single-tenant app: `realtor.ca/images/en-ca/powered_by_realtor.svg`).

## Scope

- Renderer `ListingAttribution`: official hosted logo (width 125, linked to REALTOR.ca) + trademark
  text.
- `integration.sync_paused` column + migration `0009`; the scheduled dispatcher
  (`listConnectedListingSources`) skips paused integrations.
- App-server: `runTenantListingSync` (inline engine run) + `syncListingSourceFn` (current tenant,
  owner/admin); dashboard `ListingsCard` gains Sync now / Reconcile.
- Super admin: `super-admin.ts` (email-allowlist guard), `admin.ts`
  (`adminListIntegrationsFn`/`adminSyncFn`/`adminSetPausedFn`), `/admin` route, and an "Open admin
  console" link surfaced on the dashboard for super admins.
- `SUPER_ADMIN_EMAILS` documented in `.env.example`.

## How super admin works

Super admin is a **platform** role, separate from org roles (owner/admin/member operate within one
org). Membership is an env allowlist (`SUPER_ADMIN_EMAILS`) — no self-promotion, no schema for it.
It grants cross-tenant **operational** control (see health, trigger a sync, pause/resume a tenant's
schedule) but never the ability to edit tenant content. Global cadence stays in worker cron
constants; per-tenant scheduling is the `sync_paused` kill-switch.

## Non-goals

- A full internal ops app (`apps/admin`, M7) — this is a focused DDF console in the control centre.
- Global cadence editing from the UI (worker config), and DB-role/2FA-based admin (env allowlist is
  the MVP mechanism).

## Ownership

- `apps/renderer/src/listings-render.tsx`
- `packages/db/src/schema/integration.ts`, `drizzle/0009_*.sql`, `packages/core/src/integrations/config.ts`
- `apps/app/src/server/{listings.ts,admin.ts,super-admin.ts}`,
  `apps/app/src/components/listings-card.tsx`, `apps/app/src/routes/admin.tsx`, `.env.example`

## Acceptance criteria

- Sync now / Reconcile run immediately and report counts; owner/admin only.
- `/admin` is limited to `SUPER_ADMIN_EMAILS`; shows all tenants' status/health; sync + pause/resume
  work; paused tenants are skipped by the scheduler.
- Attribution shows the official REALTOR.ca logo.
- `check`, `test:unit`, Biome, `build`, and CSS budgets pass.

## Verification

- `pnpm --filter @realtr/db run db:generate` (clean), `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`, `pnpm test:unit`, `node scripts/check-css-budgets.mjs`
- Manual: connect a real DDF key, Sync now, view `/listings`; as a super admin open `/admin`.
