# AGENTS.md

This file is the operating guide for coding agents working in `realtr-saas`. Read it before
changing code. The product direction and local setup live in `README.md`; the sequenced delivery
plan lives in `docs/EXECUTION_PLAN.md`.

## Product objective

Build a self-serve, multi-tenant website platform for Canadian realtors and brokerages. A customer
can create and brand a site, publish it on a platform or vanity domain, display listings imported
from REALTOR.ca DDF, and capture leads. The experience should feel closer to Shopify or
Squarespace than to a bespoke web-design engagement.

The first shippable product is for a solo realtor. Preserve the existing organization/site model so
brokerages and agent-owned sites can follow without redesigning tenancy.

## Repository map and ownership

- `apps/app`: authenticated realtor control centre and onboarding. This is customer-facing; do not
  call it `admin` in code or copy.
- `apps/renderer`: public tenant websites, resolved from the HTTP `Host` header.
- `apps/marketing`: Realtr's public marketing site.
- `apps/worker`: background and scheduled jobs using pg-boss.
- `packages/db`: Drizzle schema, migrations, and seeds. Keep it a leaf package; do not import UI or
  application modules here.
- `packages/core`: business logic shared by apps, including tenancy, encryption, listing-source
  providers, and CRM providers.
- `packages/site`: stable block content contracts, template implementations, and the registry used
  by both editor and renderer.
- `packages/ui`: shared primitives and theme-token-to-CSS-variable behavior.
- `docs/EXECUTION_PLAN.md`: milestones, dependency order, acceptance criteria, and suggested work
  packages for agents.

Do not create `apps/admin` for realtor features. That name is reserved for a later internal Realtr
operations console.

## Non-negotiable invariants

### Tenant isolation

- An `organization` is the tenant boundary. Every tenant-owned read, write, job, cache key, and
  integration call must be scoped to an authorized organization.
- Never authorize a mutation by checking only that a record exists. Resolve the authenticated
  member and constrain the query through `organizationId` (or an equivalent ownership join).
- Never accept an organization ID from the browser as proof of access. Derive the active or allowed
  organization from the server-side session and membership.
- Background-job payloads may identify an organization, but workers must load the corresponding
  integration and data with that same tenant scope.
- Public rendering may resolve a site by host. It must serve only domains in an explicitly
  servable state and must not expose integration credentials or private organization data.

### Credentials and personal data

- Never commit or log secrets, DDF credentials, CRM tokens, magic links, raw lead payloads, or
  personal information. Development-only magic-link logging must remain clearly gated from
  production.
- Store integration credentials only in encrypted form. Decrypt them immediately before provider
  use; do not return them to clients.
- Validate all server-function, route, webhook, provider, and job inputs at their boundary. Prefer
  Zod schemas shared with the relevant domain package.

### Sites, themes, and templates

- A block's content contract is stable and template-independent. A template may override rendering,
  but switching templates must preserve compatible page content.
- Theme values flow through `ThemeTokens` and CSS variables. Avoid embedding tenant-specific colors
  or fonts directly in components.
- Persist versioned page/template data when introducing a breaking content-shape change, and supply
  a migration or compatibility path.
- The editor and public renderer must use the same template registry and Puck configuration.

### Listings and integrations

- Normalize provider data at the provider boundary; application and rendering code must not depend
  on DDF-specific field names.
- Listing identity is tenant-aware. Do not allow one organization's import to update another
  organization's record, even when upstream identifiers collide.
- Synchronization must be idempotent, retryable, observable, and safe after partial failure. Do not
  enqueue a demonstration job on production startup.
- Provider interfaces belong in `packages/core`; provider-specific transport code stays behind
  those interfaces.

## How to work

1. Read the relevant milestone and its dependencies in `docs/EXECUTION_PLAN.md`.
2. Inspect the current implementation and git status. Preserve user changes and avoid unrelated
   cleanup.
3. State the smallest independently reviewable slice you are implementing. If multiple agents are
   active, claim distinct files or agree on interfaces before editing shared files.
4. Add or update tests with behavior. For security-sensitive work, include a negative cross-tenant
   case. For migrations, verify both a fresh database and an upgrade path when practical.
5. Run the narrowest useful checks while iterating, then the repository checks before handoff.
6. Report changed files, verification performed, remaining risks, and any follow-up that is now
   unblocked. Do not report a milestone complete unless its acceptance criteria are satisfied.

Keep changes vertical where possible: schema or contract, server behavior, UI, and tests for one
user-visible capability. Avoid large speculative abstractions and avoid replacing the selected
stack without an explicit architecture decision.

## Engineering conventions

- Runtime/package manager: Node 22+ and pnpm 11 workspaces.
- Language: strict TypeScript and ESM.
- Formatting/linting: Biome. Follow existing style (no semicolons, double quotes).
- Web apps: TanStack Start, React 19, and file-based routes.
- Data: PostgreSQL with Drizzle. Schema changes require a generated migration committed with the
  schema change; do not hand-edit an already-applied migration.
- Jobs: pg-boss. Give job payloads explicit schemas and version them when compatibility matters.
- Shared packages should expose intentional public entry points; avoid reaching into another
  package's private source paths.
- Prefer server-only dynamic imports where needed to keep database and secret-bearing modules out
  of browser bundles, following the existing TanStack Start pattern.
- Add dependencies to the owning workspace. Put versions shared by several workspaces in the pnpm
  catalog.

## Verification commands

From the repository root:

```bash
pnpm check
pnpm build
```

When database behavior changes:

```bash
pnpm docker:dev
pnpm db:migrate
pnpm db:seed
```

Also exercise the affected user flow. At minimum, tenant-facing changes should test the control
centre at `localhost:3001` and public rendering at `demo.localhost:3000` or an equivalent fixture.
If the repository lacks a test harness for the changed behavior, adding one is part of the work,
not a reason to skip verification.

## Definition of done

A work package is done when its acceptance criteria pass, tenant and secret boundaries remain
intact, relevant automated tests exist, `pnpm check` succeeds, and documentation/env examples are
updated for any operator-visible change. A build or migration must also pass when the change can
affect production output or persistence.

