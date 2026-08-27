# M0-A2 — Secure domain mutations

- Status: blocked on M0-A1
- Milestone: M0 — Safety and delivery foundation

## Outcome

Every customer-facing domain mutation is organization-authorized, validates normalized input, has
safe conflict behavior, and cannot reveal or modify another tenant's domain/site.

## Why now

`addDomain` currently authorizes only by record existence. Domain control also affects routing and
certificate issuance, so this mutation must be secured before domain functionality expands.

## Required context

- accepted M0-A1 authorization API and tests
- `apps/app/src/server/tenant.ts` and dashboard domain UI
- `packages/core/src/tenant.ts`
- `packages/db/src/schema/site.ts`
- `apps/renderer/src/routes/internal/tls-check.ts`
- `Caddyfile` and production/development host settings

## Dependencies

- M0-A1 accepted

## Scope

- Refactor `addDomain` to use the shared authorization API and an organization-constrained site
  ownership query.
- Introduce a boundary schema for hostname and site ID; normalize hostnames consistently and reject
  ports, schemes, paths, wildcards, IP literals, localhost, reserved platform hosts, and malformed
  DNS names unless a documented development-only rule explicitly allows them.
- Produce safe, deterministic outcomes for duplicate ownership, domain claimed by another tenant,
  missing/foreign site, and invalid input without leaking tenant data.
- Add tests for owner success, unauthenticated denial, cross-tenant site ID, another tenant's
  hostname, normalization, and validation edge cases.
- If remove-domain or set-primary mutations already exist when this packet starts, secure them too;
  do not add new mutation features solely for this task.
- Assess whether the public renderer can serve pending domains directly and record/fix the narrow
  status gate if it can be done without defining the full M5 domain state machine.

## Non-goals

- DNS verification, background polling, certificate lifecycle, or domain purchase
- Adding new domain-management UI beyond error handling required by the secured mutation
- Defining the complete M5 domain state machine
- Broad SSRF infrastructure unrelated to hostname acceptance

## Ownership

Expected files are the authenticated tenant/domain server module, focused core hostname helpers,
renderer status gate if required, and tests. Schema/migration changes require coordination with any
active M0-E1 migration owner.

## Constraints

- Authorization and hostname availability checks must be race-safe with the database unique
  constraint.
- Do not return another tenant's organization, site, or domain identity in errors.
- TLS approval must remain fail-closed.
- Development exceptions must be explicit and impossible to enable accidentally in production.

## Acceptance criteria

- Organization A cannot add a domain to organization B's site.
- A user cannot claim or infer details about a hostname already owned by another organization.
- Invalid host forms are rejected by tests; normalized valid DNS hostnames persist consistently.
- The mutation uses the accepted M0-A1 guard rather than its own membership implementation.
- A pending or otherwise non-servable domain cannot render a public tenant site or receive TLS
  approval through existing entry points.
- Existing valid local demo behavior is retained through an explicit development path.

## Verification

Run focused authorization/domain tests plus:

```bash
pnpm --filter @realtr/app check
pnpm --filter @realtr/renderer check
pnpm check
pnpm build
```

Manually exercise same-tenant add, cross-tenant site ID, duplicate hostname, and direct renderer
requests for pending versus active fixture domains.

## Handoff

Follow the standard handoff. Include the hostname rules, safe conflict semantics, renderer/TLS
status behavior, and negative cross-tenant evidence. Identify work intentionally deferred to M5.

