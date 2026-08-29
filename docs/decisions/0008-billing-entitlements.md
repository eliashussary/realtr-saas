# ADR 0008: Billing, plans, and entitlements (M6)

- Status: Proposed
- Date: 2026-08-29
- Decision owners: product owner
- Related: `docs/EXECUTION_PLAN.md` M6; RBAC in `apps/app/src/lib/permissions.ts`
  (reserves `billing` for owner); `.env.example` (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` already stubbed)

## Context

M0–M4 close the realtor value loop (onboard → build → publish → sync listings → capture lead →
deliver to CRM), but nothing gates access on payment. M6 lets a tenant start, pay for, change, and
cancel a subscription with predictable, server-enforced access.

This is the first webhook-driven integration in the repo: M3 (DDF) and M4 (CRM delivery) both run
on the worker's pg-boss cron sweeps, not inbound webhooks. Getting a signed, replay-safe Stripe
webhook right is the core technical risk here.

## Decision

### Provider and surface

**Stripe**, using hosted **Checkout** and the **Customer Portal**. Realtr does not render card forms
or build subscription-management UI — Checkout collects payment and starts the subscription; the
Portal handles plan changes, card updates, and cancellation. This keeps Realtr out of PCI scope and
off the hook for billing UI Stripe already ships.

Stripe is the **source of truth**. Realtr keeps a thin local mirror for fast, offline reads and
entitlement decisions; the mirror is only ever written from Stripe (webhooks), never from optimistic
client state.

### Plans (provisional pricing — catalog is data, not code)

| Plan | Price (CAD/mo, provisional) | Entitlements |
|---|---|---|
| **Solo** | $129 | 1 site, 1 custom domain, DDF listing sync, leads + Follow Up Boss, 1 member, both templates |
| **Team** | $299 base (5 seats) + $49/additional seat | Everything in Solo, plus 5 included members then per-seat, agent profile pages + Team block |

Pricing is a **provisional stub** chosen to unblock build; it lives in a plan catalog module and is
changed without code review of billing logic. Real pricing is a separate product/finance decision.

**Trial:** 14-day, **card required** at signup, auto-converts to the paid plan at trial end. Card-up-
front means the trial→paid transition is an ordinary Stripe invoice, not a re-collection flow, which
sharply reduces dunning surface for the pilot. (Trial length is independent of the payment-failure
grace window below.)

### Per-seat billing (Team)

Team is a **quantity-based (licensed) subscription**: a $299 base covering 5 seats plus an
additional-seat price ($49/seat provisional). Modeled in Stripe as the Team subscription's licensed
price with `quantity = max(0, activeMembers − 5)`; Stripe bills base + extra seats and auto-prorates
mid-cycle changes.

- **Seat quantity is derived from membership, not stored separately.** When an owner/admin
  invites or removes a member, the mutation recomputes `quantity` and pushes it to the Stripe
  subscription item. The local mirror reflects it back via the resulting webhook (never optimistically).
- **Inviting beyond the included 5 confirms the added charge first** ("this adds $49/mo"), then
  increments the quantity. Enforcement (M6-A5) gates the invite on *seats available OR owner
  confirmed the add* — Solo stays a hard cap of 1; Team has no hard cap, only a cost.

### Entitlement model

A pure `@realtr/core` module resolves a tenant's current subscription to a capability set:

```
resolveEntitlements(subscription) -> {
  status,               // active | trialing | past_due | grace | lapsed | none
  canPublish, canCaptureLeads,
  customDomains, members, integrations, templates
}
```

Plans map to entitlement values via the catalog. `members` is a hard cap on Solo (1) but on Team is
the **included** count (5) — over which invites are allowed at per-seat cost, not blocked. Server-side
mutations and the worker both call the resolver — enforcement is **server-side**, never merely hidden
in UI (M6 acceptance criterion). A new `billing` RBAC resource gates *managing* the subscription
(owner/admin), separate from the entitlements a subscription *grants*.

### Local state and webhook convergence

Local mirror, keyed by organization:

- `subscription`: `organizationId`, `stripeCustomerId`, `stripeSubscriptionId`, `planId`, `status`,
  `currentPeriodEnd`, `cancelAtPeriodEnd`, `graceEndsAt`
- `billing_event`: Stripe `event.id` ledger for idempotency

Convergence rule (satisfies "replays and out-of-order delivery converge to correct state"):

1. On each webhook, verify the signature (`STRIPE_WEBHOOK_SECRET`); reject unsigned/invalid.
2. If `event.id` is already in `billing_event`, ack and stop (idempotent replay).
3. Otherwise **re-fetch the subscription object from Stripe by id** and write local state from that
   fetched object — never from the event payload. Out-of-order events therefore cannot regress state,
   because every event triggers a read of Stripe's current truth.
4. Record `event.id`.

The webhook endpoint lives in `apps/app` (holds auth + server functions); it is the one place local
subscription state is written.

### Payment-failure lifecycle

Stripe status → local status, and what each does:

| Stripe | Local | Dashboard | Public site | Leads |
|---|---|---|---|---|
| `trialing` / `active` | active | full | served | on |
| `past_due` | **grace** | **read-only** | served | **off** |
| grace elapsed (day N) | **lapsed** | read-only | **unpublished** | off |
| `active` again | active | full | served | on |

- **N = 7 days** grace by default.
- Read-only + leads-off are driven by `resolveEntitlements` returning `canPublish: false`,
  `canCaptureLeads: false` — the renderer's `/api/lead` and the editor's publish path already funnel
  through server checks, so this is a resolver flip, not new call sites.
- Unpublish at day N is a worker cron sweep (reuse the pg-boss pattern): sites whose
  `graceEndsAt < now` and still lapsed get their publication pointer cleared; the renderer already
  fail-closes to 404/holding when there is no published revision.
- Reactivation restores publish + leads immediately on the next `active` webhook.

**Product note carried from discussion:** cutting leads at `past_due` (rather than at unpublish) is
deliberate but aggressive — a transient card failure can cost the realtor real inquiries during
Stripe's retry window. The leads-off point is therefore a **config knob** (`past_due` vs
`grace_end`) so it can be softened after observing pilot behavior without a schema change.

### Canadian tax

**Stripe Tax is plumbed but disabled for the pilot.** Below CRA's ~$30k CAD small-supplier
threshold, GST/HST registration is generally not required, so the pilot does not collect tax.
Enabling collection later is a config flag plus accounting/CRA registration — no billing-logic
rework. Realtr calculates/collects via Stripe when enabled; it does not file or remit.

## Alternatives considered

- **better-auth Stripe plugin** — rejected for MVP. It couples subscription state to the auth layer
  and obscures the entitlement resolver we want as the single enforcement seam. A thin custom
  integration keeps entitlements explicit and testable from fixtures.
- **Custom in-app checkout / card capture** — rejected. Pulls Realtr into PCI scope for no MVP
  benefit; hosted Checkout + Portal cover start/change/cancel.
- **Trusting webhook event payloads directly** — rejected. Cannot guarantee ordering; the re-fetch
  rule is what makes convergence provable.
- **No-card trial** — rejected per product decision; card-up-front minimizes dunning.

## Consequences

- New platform env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs per plan. Stripe keys are
  platform-level (unlike per-tenant integration configs), so they need no app-layer encryption; we
  store only Stripe customer/subscription **ids** locally.
- Enforcement (M6-A5) touches mutations owned by M2/M3/M4 (publish, add-domain, connect-integration,
  invite-member). Sequenced last and collision-flagged so it lands after the resolver exists and is
  tested permissive.
- Support reconciliation (tenant ↔ Stripe customer, event history) is an M6-A6 super-admin console
  addition, satisfying the "support can reconcile" criterion.
- Retention on cancellation follows the same lifecycle table (cancel = `cancelAtPeriodEnd`, then
  lapse at period end); documented site/data retention behavior is the unpublish-at-day-N policy plus
  data kept intact for reactivation.

## Follow-up work (M6 packets)

1. **M6-A1** entitlement model + service: `plan`/`subscription`/`billing_event` schema (migration
   0014), pure resolver, `billing` RBAC resource, enforcement seams wired permissive, unit tests.
2. **M6-A2** Checkout: get-or-create customer per org, Checkout session server fn, billing settings
   page shell.
3. **M6-A3** webhooks + sync: signed endpoint, event ledger, re-fetch-and-converge, status mapping;
   replay + out-of-order tests from saved Stripe fixtures (offline, no live calls).
4. **M6-A4** Portal + lifecycle: Customer Portal link; trial / past_due / grace / lapse transitions
   via worker sweep; dunning surfaces.
5. **M6-A5** enforcement flip: permissive → enforcing on publish / add-domain / connect-integration /
   invite-member, with UI upsell states. Includes Team seat-quantity sync (membership change →
   Stripe quantity) and the invite-beyond-included confirm-charge flow.
6. **M6-A6** ops: tenant↔customer reconciliation, event history, comp/extend in super-admin console.

## Owner decisions (resolved 2026-08-29)

- Pricing (Option B): **Solo $129/mo**, **Team $299/mo** (5 included seats) **+ $49/additional seat**
  — all CAD, provisional stub, editable as catalog config. Positions Realtr at the premium of the
  mid-market site+IDX band while staying a clear bargain against $300 all-in-ones.
- Grace window: **N = 7 days**. Leads-off point defaults to `past_due` (config knob to soften to
  `grace_end` after pilot).
- Team seating: **5 included, then per-seat** (no hard cap; Solo hard-capped at 1).

Still open (non-blocking for M6-A1):

- Confirm the $49 additional-seat price before launch.
- **Annual billing** (~2 months free) — recommended, adds a second price per plan; not yet decided.
- **Founder/pilot discount** — recommended (e.g. 30% off for 12 months, a Stripe coupon, no catalog
  change); not yet decided.
- Whether custom domains beyond 1 are ever in scope for MVP (assumed no).
