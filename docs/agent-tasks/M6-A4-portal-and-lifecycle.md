# M6-A4 — Customer Portal + grace→lapse lifecycle

**Work package:** M6 (Billing, plans, entitlements) — the payment-failure lifecycle: the self-service
Portal (the way *out* of a failure), the time-based grace→lapse transition, and the dunning surface
(ADR 0008 §"Payment-failure lifecycle").

## Outcome

- Customers can open the **Stripe Customer Portal** from the billing page to fix a failed card, change
  plan, or cancel — Realtr renders none of that UI.
- A subscription stuck in `past_due` past its grace deadline is moved to `lapsed` by a scheduled
  worker sweep — the one billing transition no webhook can make (it is time-based, not event-driven).
- The billing page shows a **dunning banner** while a subscription needs attention (payment failed →
  "update your card by <grace date>"; lapsed → "your site is offline, content kept intact").

## Design note (deviation from ADR 0008, deliberate)

ADR 0008 sketched lapse as "clear the site's publication pointer." A4 instead makes the sweep set
only the mirror **status** (`past_due` → `lapsed`); the *effect* of lapse (site unavailable, leads
off) is left to the M6-A5 enforcement flip, which is the single coordinated point where the
permissive `resolveEntitlements` seams become enforcing across serve + mutation paths. This keeps
billing state and content/publication state separate, makes reactivation lossless (A3 already clears
`graceEndsAt` and restores `active` on the recovery webhook — no revision surgery), and avoids a
half-enforcing state before A5. The ADR's outcome ("site unpublished when lapsed; reactivation
restores immediately") is preserved.

## Scope

- `@realtr/core` `billing/lifecycle.ts` — pure `shouldLapse(status, graceEndsAt, now)` + `runGraceSweep(repo, now)`
  over a `GraceSweepRepository` port (unit-tested, no DB). Re-applies `shouldLapse` in the engine so
  the predicate never drifts from the query.
- `@realtr/core` `stripe-gateway.ts` — `createBillingPortalSession(config, {customerId, returnUrl})`
  (standalone, so it adds no surface to the checkout fakes).
- `@realtr/db` `billing.ts` — `createGraceSweepRepository(db)`: `listGraceCandidates` (prefilter on
  `subscription_grace_idx`) + `markLapsed` (guarded to `past_due`, so a concurrent recovery wins).
- `apps/worker` — `billing-sweep.ts` (dependency-injected, DB-free unit test) + queue/schedule wiring
  in `runtime.ts` (hourly; grace is measured in days).
- `apps/app` — `openBillingPortalFn` server fn (owner/admin, requires a provisioned customer);
  `getBillingStatusFn` now returns `graceEndsAt` (ISO); billing card gains a dunning banner + a
  "Manage billing" (Portal) button.

## Non-goals

- Enforcement flip — making `lapsed`/`past_due` actually block serving/leads/mutations
  (`resolveEntitlements` is still wired permissive) is **M6-A5**, together with Team seat-quantity sync
  and the invite-beyond-included confirm-charge flow.
- Support reconciliation console (M6-A6).

## Ownership

- `packages/core/src/billing/lifecycle.ts` (+ test), `stripe-gateway.ts`, `billing/index.ts`,
  `core/src/index.ts`
- `packages/db/src/billing.ts` (`createGraceSweepRepository`) + integration test
- `apps/worker/src/billing-sweep.ts` (+ test), `apps/worker/src/runtime.ts`
- `apps/app/src/server/billing.ts`, `apps/app/src/components/billing-card.tsx`

## Acceptance criteria

- The sweep lapses exactly the `past_due` subscriptions whose `graceEndsAt <= now` and leaves all
  others; `markLapsed` never touches a subscription that recovered to `active`.
- The Portal link is owner/admin-only, requires a provisioned Stripe customer, and returns a hosted URL.
- The dunning banner reflects `past_due`/`grace` (with the grace date) and `lapsed`.
- `check`, `test:unit`, Biome, and `build` pass; the grace sweep repo has an integration test.

## Verification

- `pnpm --filter @realtr/core run test:unit` (lifecycle), `pnpm --filter @realtr/worker run test:unit`
  (sweep handler), `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`. DB integration runs
  under `pnpm test:integration` (Docker Postgres; CI).
