# M6-A3 — Stripe webhooks (re-fetch-and-converge)

**Work package:** M6 (Billing, plans, entitlements) — the signed, replay-safe, order-independent
webhook that keeps the local subscription mirror converged to Stripe's truth (ADR 0008).

## Outcome

Stripe subscription lifecycle events (created/updated/deleted, Checkout completion, invoice
payment success/failure) are received at a signed endpoint and applied to the local `subscription`
mirror. This is the **one place** local subscription state is written. Replays are ignored and
out-of-order delivery cannot regress state, because every event re-fetches Stripe's current truth and
writes from that — never from the event payload (ADR 0008 §"Local state and webhook convergence").

## Scope

- `@realtr/core` `billing/webhook.ts` — **pure** convergence over injected ports:
  `handleBillingWebhook(event, deps)` = dedupe (`isDuplicate`) → re-fetch (`fetchSubscription`) →
  resolve org (metadata, else customer lookup) → map status + grace deadline → `writeMirror` →
  `recordEvent`. Plus pure `mapStripeStatus`, `nextGraceEndsAt`, `snapshotToMirror`.
- `@realtr/core` `stripe-gateway.ts` — `createStripeWebhookAdapter(config, secret)` with `verify`
  (Stripe signature via `constructEvent`) and `fetchSubscription` (retrieve + normalize to a
  provider-agnostic snapshot). SDK stays in this one file. `stripeWebhookSecretFromEnv`,
  `graceDaysFromEnv`.
- `@realtr/db` `billing.ts` — `hasBillingEvent` / `recordBillingEvent` (ledger, `onConflictDoNothing`
  on the event-id PK), `findOrgByStripeCustomerId`, `writeSubscriptionMirror` (upsert by org).
- `apps/app` `routes/api/billing/webhook.ts` — raw-body POST endpoint: verify signature, wire the DB
  ports + adapter into the converger. 400 on missing/invalid signature, 503 when Stripe is not
  configured, 500 on unexpected failure (so Stripe retries), 200 otherwise (incl. duplicate/ignored).

## Status mapping (Stripe → local)

`trialing → trialing`, `active → active`, `past_due`/`unpaid → past_due` (anchors `graceEndsAt` at
`now + BILLING_GRACE_DAYS`, default 7; preserved across retry events so lapse is not pushed out),
`canceled → canceled`, everything else (`incomplete`/`paused`/…) `→ none`. Leaving a grace state
clears `graceEndsAt`. The grace→`lapsed` transition after the deadline is the M6-A4 worker sweep, not
a single event's decision.

## Non-goals

- Customer Portal link and the trial/grace/lapse **worker sweep** (M6-A4).
- Enforcement flip (permissive → enforcing) and Team seat-quantity push (M6-A5).
- Support reconciliation console (M6-A6).

## Ownership

- `packages/core/src/billing/webhook.ts` (+ test), `packages/core/src/billing/stripe-gateway.ts`,
  `packages/core/src/billing/index.ts`, `packages/core/src/index.ts`
- `packages/db/src/billing.ts` (+ `packages/db/test/billing.integration.test.ts`)
- `apps/app/src/routes/api/billing/webhook.ts`
- `.env.example` (`BILLING_GRACE_DAYS`)

## Acceptance criteria

- A replayed `event.id` is acked and ignored with no re-fetch and no write.
- Out-of-order delivery converges: an event applied after the truth moved on still writes current
  truth (proven by a test where the event type disagrees with the fetched snapshot).
- `past_due` sets the grace deadline once and preserves it across retries; recovery to `active`
  clears it.
- Unresolvable / non-subscription / not-found events are recorded (cheap replays) but write nothing.
- The endpoint rejects unsigned/invalid signatures; the mirror is written nowhere else.
- `check`, `test:unit`, Biome, and `build` pass; the db ledger/upsert/lookup have an integration test.

## Verification

- `pnpm --filter @realtr/core run test:unit` (convergence + mapping), `pnpm -r --parallel check`,
  `biome check .`, `pnpm -r build`. DB integration (`billing.integration.test.ts`) runs under
  `pnpm test:integration` (Docker Postgres; runs in CI).
