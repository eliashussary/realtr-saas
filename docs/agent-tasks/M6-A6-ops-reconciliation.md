# M6-A6 — Billing ops reconciliation console

**Work package:** M6 (Billing, plans, entitlements) — satisfies the M6 acceptance criterion "support
can reconcile a tenant to its billing customer and event history" (ADR 0008 §Consequences).

## Outcome

The super-admin console gains a **Billing** section: for every tenant, its subscription mirror joined
to the org (status, plan, seat quantity, Stripe customer + subscription ids, renewal date, grace
deadline, cancel-at-period-end) plus the most recent applied Stripe events — enough to reconcile a
tenant to Stripe and see what happened. One operational action: **extend grace** by 7 days for a
past-due tenant, to hold off the lapse sweep.

## Scope

- `@realtr/db` `billing.ts`: `listSubscriptionsForAdmin` (mirror ⨝ organization),
  `recentBillingEvents(org, limit)` (event history), `extendSubscriptionGrace(org, until)` (guarded to
  past_due — grace is a local concept, so this doesn't fight Stripe).
- `apps/app` `server/admin.ts`: `adminListBillingFn` (super-admin; rows + recent events) and
  `adminExtendGraceFn` (super-admin; +N days, 1–90).
- `apps/app` `routes/_dashboard.admin.tsx`: renamed to "Operations console" with a **Billing** section
  (reconciliation rows + an "Extend grace 7d" button on past_due rows). The existing DDF sync section
  is unchanged, now under a "DDF sync" heading.

## Non-goals

- True **comp** (a free/discounted period) — that's a Stripe coupon, out of local-mirror scope; the
  console does not fake it with a local status override (which the next webhook would revert). Grace
  extension is the one local, non-conflicting operational lever.
- Cross-tenant impersonation / editing tenant content — super admin stays ops-only (as established).

## Ownership

- `packages/db/src/billing.ts` (+ integration test), `apps/app/src/server/admin.ts`,
  `apps/app/src/routes/_dashboard.admin.tsx`

## Acceptance criteria

- A super admin sees every tenant's subscription reconciled to its Stripe ids + recent event history.
- Extend-grace pushes a past_due tenant's `graceEndsAt` out and never affects a non-past_due tenant.
- Non-super-admins get `forbidden`; the console is read + the single grace action only.
- `check`, `test:unit`, Biome, `build` pass; the reconciliation reads + extend-grace have an
  integration test.

## Verification

- `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`; DB integration under
  `pnpm test:integration` (Docker Postgres; CI).
