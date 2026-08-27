# M0-A1 — Authorization inventory and organization guard

- Status: blocked on M0-C1
- Milestone: M0 — Safety and delivery foundation

## Outcome

Authenticated server code has one reusable, server-only authorization path that derives the user
and allowed organization from the session and supports ownership-constrained tenant queries.

## Why now

The current domain mutation checks only that a site exists. Every subsequent editor, integration,
billing, and lead feature would multiply this vulnerability without a shared authorization contract.

## Required context

- `AGENTS.md`, especially tenant isolation
- `docs/agent-tasks/M0-C1-test-foundation.md` and the merged test helpers
- `apps/app/src/lib/auth.ts`, `apps/app/src/server/tenant.ts`, and auth routes
- `packages/db/src/schema/auth.ts`, `site.ts`, `integration.ts`, and `listing.ts`
- Better Auth organization configuration actually present in the repository

## Dependencies

- M0-C1 accepted and canonical test commands available

## Scope

- Inventory every authenticated server function and route, its resource, authentication behavior,
  and current organization/ownership check. Commit the inventory as task documentation or tests.
- Define a small server-only authorization API that resolves the session, membership, role, and
  active/target organization without trusting browser-provided organization identity.
- Define typed unauthenticated, forbidden, and not-found outcomes that callers can safely translate
  without leaking cross-tenant record existence.
- Add helpers or query patterns for organization-constrained site ownership.
- Apply the shared session/member resolution to dashboard reads without changing the user-facing
  onboarding flow in this packet.
- Add unit/integration tests using the two-tenant fixtures, including unauthenticated access,
  authorized same-tenant access, and denied cross-tenant access.
- Document the intended active-organization semantics and role-extension seam. If the existing auth
  configuration cannot support an unambiguous choice, write an ADR and stop short of inventing UI.

## Non-goals

- Adding/removing/primary-domain APIs; M0-A2 owns domain mutations
- Organization switcher or role-management UI
- Redesigning onboarding
- Authorizing public host-based rendering
- Adding broad repository-wide policy frameworks

## Ownership

Expected changes are server-only authorization modules, dashboard server reads, focused tests, and
possibly an authorization ADR. Do not change domain mutation behavior beyond the minimum needed to
compile; M0-A2 owns it.

This packet owns the authorization API shape. Other active agents must consume it rather than create
a competing helper.

## Constraints

- Never accept `organizationId`, `memberId`, or role claims from the client as authorization proof.
- When access is denied, avoid revealing whether another tenant's resource exists.
- Keep DB/auth imports out of browser bundles.
- An organization may have multiple members and sites; do not encode “first membership forever” as
  the long-term contract without documenting the temporary behavior.

## Acceptance criteria

- The inventory covers every current authenticated entry point.
- One server-only API derives authenticated user and allowed organization membership.
- A two-tenant integration test proves a user from organization A cannot obtain organization B's
  dashboard/site data through the guarded path.
- Missing session, missing membership, forbidden resource, and allowed resource behavior are typed
  and tested.
- Existing signup/login/dashboard behavior remains functional.
- No secret-bearing or database module enters a client bundle.

## Verification

Run the canonical unit and integration commands from M0-C1, then:

```bash
pnpm --filter @realtr/app check
pnpm check
pnpm build
```

Manually authenticate as a fixture or development user and load the dashboard. Exercise a direct
cross-tenant resource ID through the lowest-level guarded test/API surface and confirm a safe denial.

## Handoff

Follow the standard handoff. Include the entry-point inventory, authorization API signature,
active-organization behavior, response/error semantics, negative tenant test evidence, and exact
instructions M0-A2 should follow.

