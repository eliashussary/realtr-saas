# ADR 0003: Server organization authorization

- Status: accepted
- Date: 2026-08-27

## Context

Authenticated control-centre code needs a single tenant decision before it reads or mutates
organization-owned data. Better Auth's organization plugin stores an optional
`activeOrganizationId` on the server session, while existing onboarding creates a membership
without explicitly setting that value. Users may eventually belong to several organizations.

## Decision

`resolveOrganizationAuthorization` is the server-only authorization boundary. It accepts only the
session returned by Better Auth on the server, then loads a matching membership from PostgreSQL.
When the session has an active organization, that organization is allowed only if the user has a
membership. Browser-provided organization, member, or role values are never inputs to the decision.

For compatibility with today's onboarding, a session without an active organization uses the
user's earliest membership, ordered by membership creation time and ID. This is a deterministic
temporary default, not a permanent "first organization" product rule. A future organization
switcher must set Better Auth's active organization and may then remove the fallback after existing
sessions have been migrated or refreshed.

The successful result contains `userId`, `organizationId`, `memberId`, and the stored role. Roles
are exposed as data for later capability checks; this packet does not define a role-policy matrix.
Failures are typed as `unauthenticated`, `forbidden`, or `not_found`. Organization-owned resource
queries constrain by the resolved organization. An absent resource and another tenant's resource
both produce `not_found`, so callers cannot disclose cross-tenant existence.

## Alternatives considered

- Trust a client-supplied organization ID: rejected because it is not proof of membership.
- Always choose an arbitrary membership: rejected because query order is unstable and ignores an
  explicitly selected organization.
- Require an active organization immediately: deferred because that would break the current
  onboarding flow and requires product/UI work outside this packet.
- Introduce a general policy framework: rejected as premature for the current small surface.

## Consequences

All authenticated server entry points must resolve this authorization context before tenant access.
Queries then use its `organizationId` as an ownership constraint. Mutation callers translate
`unauthenticated` to an authentication response, `forbidden` to a generic denial, and resource
`not_found` to a generic missing response without first performing an unscoped lookup.

M0-A2 should dynamically import this server module, call `resolveOrganizationAuthorization` with
the Better Auth server session, and call `findAuthorizedSite` before any domain mutation. It must
not query a site by ID first or accept organization identity from its validator.
