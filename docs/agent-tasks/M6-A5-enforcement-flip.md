# M6-A5 — Enforcement flip (permissive → enforcing)

**Work package:** M6 (Billing, plans, entitlements) — the slice that makes the entitlement resolver
actually gate access, server-side, across every seam the plan grants (ADR 0008 §"Entitlement model").

## Outcome

Entitlements stop being advisory. Every capability a plan grants is now enforced at its server-side
choke point, so a lapsed/past-due tenant is genuinely limited — not merely shown a different UI. A
pre-billing tenant (no subscription row → permissive `UNMANAGED`) is unaffected, so pilots keep working.

## The single seam

`@realtr/core` `loadEntitlements(organizationId)` reads the subscription mirror and returns
`resolveEntitlements(...)`. Every enforcement point calls it — mutations, the renderer serve path, and
lead capture — so the rules live in exactly one place. `Entitlements` gained `siteServed` (true through
the grace window, false only once lapsed/canceled) and `additionalSeatPriceCents`.

## Enforcement points

| Seam | Where | Rule |
|---|---|---|
| Publish / rollback | `apps/app/server/site-publish.ts` | `canPublish` → else `payment_required` |
| Add custom domain | `apps/app/server/tenant.ts` `addDomain` | existing custom-domain count `< customDomains` (0 when not good) |
| Connect CRM | `apps/app/server/crm.ts` | `canManageIntegrations` → else `payment_required` |
| Connect listing source | `apps/app/server/listings.ts` | `canManageIntegrations` → else `payment_required` |
| Invite member | `apps/app/server/team.ts` | `evaluateInvite` (see below) |
| Serve public site | `@realtr/core` `resolvePublishedSite` | `siteServed` → else `status: "suspended"` (renderer → 402 holding page) |
| Capture leads | `@realtr/core` `captureLead` | `canCaptureLeads` → else silently dropped (past_due stops leads while the site is still served) |

The serve gate lives in `resolvePublishedSite` — the one host→org resolver every public read (home,
splat pages, listings, agents, and `captureLead`) funnels through, so a single change covers them all.

## Seat billing (Team)

- **`evaluateInvite`** (pure, unit-tested): Solo is a hard cap of 1 (`seat_limit`); a not-in-good-
  standing subscription blocks invites (`payment_required`); Team inviting beyond the included 5 is
  billable and returns `seat_charge_confirm { addedMonthlyCents }` until the owner confirms, then
  allows. A seat = a member OR a pending invitation.
- **`syncSeatsForOrg`** (best-effort): on member add (invite accepted) / remove, recompute
  `quantity = max(0, memberCount − includedMembers)` and push it to the Stripe subscription's seat line
  (`syncSubscriptionSeatQuantity`). Self-guarding (no-op when unconfigured / no subscription / non-
  metered) and never throws — membership management never depends on Stripe. The mirror reflects the
  new quantity back via the resulting `subscription.updated` webhook (A3), never optimistically.

## Design note (realizes ADR 0008)

ADR 0008 sketched lapse as "clear the publication pointer." A5 instead gates *serving* on entitlements
at `resolvePublishedSite` (returns `suspended`), leaving publication state untouched. This keeps
billing and content state separate and makes reactivation lossless — the A3 recovery webhook flips
status back and the site serves again immediately, with no revision surgery. The ADR outcome (site
dark when lapsed, restored on reactivation) holds. (First noted in the M6-A4 packet.)

## Non-goals

- Annual billing / coupons / founder discount (ADR "still open").
- A blanket read-only dashboard at past_due — deliberately not done: the billing page must stay usable
  to recover. Enforcement is at the named capability seams, not a global lock.

## Ownership

- `packages/core/src/billing/{entitlements,service,seats,stripe-gateway,index}.ts`,
  `packages/core/src/billing/{seats,entitlements}.test.ts`, `packages/core/src/{published,leads}.ts`,
  `packages/core/src/index.ts`
- `apps/app/src/server/{site-publish,tenant,crm,listings,team}.ts`
- `apps/app/src/routes/{sites.$siteId.edit,_dashboard.team}.tsx` (UI messaging + seat-charge confirm)
- `apps/renderer/src/published-site.tsx` (suspended → 402 holding page)

## Acceptance criteria

- Every seam blocks server-side when the entitlement is absent; UI messaging is secondary.
- Pre-billing (`UNMANAGED`) and good-standing tenants are unaffected.
- `siteServed` is true through grace, false once lapsed; leads stop at past_due while the site is served.
- `evaluateInvite` enforces Solo's cap and Team's confirm-charge; seat quantity syncs best-effort.
- `check`, `test:unit`, Biome, `build` pass.

## Verification

- `pnpm --filter @realtr/core run test:unit` (entitlements `siteServed`, `evaluateInvite`),
  `pnpm -r --parallel check`, `biome check .`, `pnpm -r build`.
