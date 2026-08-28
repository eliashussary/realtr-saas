# Realtr execution plan

Status: initial plan based on the repository as of 2026-08-27. Update this document as decisions are
made and slices land; it is the coordination source for dispatched agents, not a promise of dates.

## Product outcome

A Canadian realtor can sign up without assistance, create a polished branded website, connect a
REALTOR.ca DDF feed, edit and preview content, publish on a Realtr subdomain or a verified custom
domain, receive leads, and pay for the service. Realtr operators can understand tenant, domain,
sync, and subscription health without directly editing production data.

## Current baseline

Already present:

- pnpm/TypeScript monorepo with control centre, tenant renderer, marketing app, and worker
- passwordless Better Auth plus organization tables and first-login site creation
- host-to-domain-to-site resolution and a Caddy on-demand TLS check endpoint
- one `modern` template, shared Puck block contracts, theme tokens, and seeded demo content
- provider registries for listing sources and CRMs
- initial Drizzle schema for sites, domains, integrations, and listings
- Docker development and single-host production topology

Prototype gaps that affect sequencing:

- domain creation is not yet tenant-authorized; broader authorization policy and tests are absent
- DDF and Follow Up Boss providers are stubs; the worker neither loads encrypted configuration nor
  persists normalized listings
- the listing schema is a JSON placeholder and its current upstream uniqueness is not tenant-scoped
- there is no site/page editor, durable preview/publish workflow, template gallery, or theme UI
- domain verification/status automation, platform subdomains, email delivery, billing, lead storage,
  product analytics, and internal operations tooling are not implemented
- there is no automated test harness or CI quality gate

## Delivery principles

- Ship a solo-realtor vertical slice before brokerage complexity.
- Treat organization authorization, secret handling, and provider terms/compliance as launch gates.
- Separate draft from published site state so editing cannot break a live customer site.
- Prove DDF access, permitted storage/display fields, refresh expectations, and attribution rules
  before committing the production data model. DDF access is an external dependency, not merely an
  engineering task.
- Prefer explicit state machines for domains, integrations, publishing, syncs, and subscriptions.
- Instrument important workflows when they are built, rather than adding observability at the end.

## Dependency sequence

```text
M0 Safety + delivery foundation
 |-- M1 Account + tenant foundation
 |    |-- M2 Site editing + publishing ---- M3 Listings + DDF
 |    |               |                       |
 |    |               +-----------+-----------+
 |    |                           M4 Leads + CRM
 |    +-- M5 Domains
 |    +-- M6 Billing + entitlements
 +-------------------------------- M7 Operations + launch
```

M2, M5, and the DDF discovery portion of M3 can proceed in parallel after M0/M1 contracts are
stable. Billing can begin earlier at the schema/provider boundary, but enforcement depends on the
product capabilities it gates.

## Milestones

### M0 — Safety and delivery foundation

Goal: make parallel development safe and establish a trustworthy baseline.

Work packages:

- `M0-A Authorization`: introduce reusable server-side membership/ownership guards; apply them to
  domain creation and all authenticated site reads/writes. Add cross-tenant denial tests.
- `M0-B Validation and errors`: add boundary schemas and consistent safe error responses for server
  functions, routes, provider config, and jobs.
- `M0-C Test harness`: choose and configure unit/integration tooling, a disposable PostgreSQL test
  database strategy, fixtures for two organizations, and smoke tests for auth/tenant rendering.
- `M0-D CI`: run install, generated-route/type checks, Biome, tests, and production builds. Document
  required versus optional checks.
- `M0-E Data corrections`: make listing uniqueness organization-aware; define enums/checks or typed
  state constants for domain and integration states; generate migrations.
- `M0-F Runtime hygiene`: remove boot-time demo job behavior outside an explicit dev/seed path, add
  graceful worker shutdown, and validate environment configuration at startup.
- `M0-G UI foundation`: approve ADR 0001, configure shadcn/ui monorepo generation into
  `packages/ui`, establish control-centre semantic tokens, add the first reviewed primitive set and
  a component workbench, and introduce automated accessibility and visual-regression checks.

Acceptance criteria:

- a member of organization A cannot read or mutate organization B's sites, domains, integrations,
  listings, or jobs through application entry points
- CI rejects lint, type, test, build, and migration drift failures
- tests can run repeatably without relying on a developer's persistent database
- production startup creates no sample tenant work
- foundational controls have reviewed interaction states, keyboard behavior, and screenshot
  baselines at the supported viewport/theme combinations

### M1 — Account, organization, and onboarding foundation

Goal: a realtor can safely create and manage the account that owns a site.

Work packages:

- production magic-link email, branded auth screens, rate limiting, redirect safety, and recovery
- explicit onboarding flow for profile/brand basics instead of side effects during dashboard reads
- organization switcher and role policy (`owner`, `admin`, `member`) with server-enforced permissions
- realtor profile and brokerage-ready member profile fields required by templates and listing
  attribution
- audit events for membership, integration, domain, publish, and billing mutations

Acceptance criteria:

- a new user completes onboarding once and lands on a provisioned draft site
- authentication email works in production without logging secrets; abuse controls are tested
- roles and active-organization behavior are explicit and tested across two organizations
- onboarding failures are resumable and do not create duplicate organizations/sites

### M2 — Site builder, templates, and publishing

Goal: a realtor can customize, preview, and safely publish a high-quality site.

Work packages:

- page model and routes: named pages, navigation, SEO fields, slugs, redirects, 404 behavior
- versioned draft/published documents with save status, optimistic concurrency, revision history, and
  rollback
- Puck editor embedded in the control centre using the same registry as the renderer
- theme editor for logo, color, typography, radius, imagery, and social/contact data
- responsive preview and explicit publish flow
- template selection/switching with content-compatibility tests
- production-grade initial block set, accessibility, image optimization, metadata, sitemap, and
  structured data

Acceptance criteria:

- edits are private until publish; the renderer always serves the last valid published revision
- simultaneous or stale edits cannot silently overwrite newer work
- template switching retains compatible content and can be previewed before publish
- representative pages meet agreed mobile/desktop visual, accessibility, and performance budgets

### M3 — Listings and REALTOR.ca DDF

Goal: connected tenants receive correct, current listings rendered on their sites.

External discovery gate:

- confirm DDF participant eligibility/onboarding, credentials and environment availability, API/feed
  protocol, permitted caching and image handling, mandatory attribution/disclaimers, update/delete
  obligations, rate limits, and launch approval process
- acquire sanitized response fixtures and document the field mapping; never commit live credentials

Work packages:

- versioned canonical listing model for identity, status, price, property facts, address/geography,
  brokerage/agent attribution, media, timestamps, and raw-source diagnostics
- DDF client with typed configuration, authentication, pagination, retry/backoff, timeout, and fixture
  contract tests
- incremental sync pipeline that loads/decrypts tenant integration config, normalizes and upserts in
  transactions, marks stale/deleted listings, records runs/errors, and is idempotent
- scheduler, manual sync, concurrency/rate controls, dead-letter/retry behavior, and health UI
- listing grid/detail/search/filter routes, canonical URLs, SEO/structured data, attribution, and
  empty/error states
- integration setup/test/disconnect UI with credential redaction and audit events

Acceptance criteria:

- replaying a sync produces no duplicates or cross-tenant updates
- changed and removed upstream listings converge correctly after retries and partial failures
- sync freshness and actionable failures are visible to the customer and operator
- public listing pages comply with confirmed DDF display and attribution requirements
- provider contract tests run from sanitized fixtures without network access or secrets

### M4 — Lead capture and CRM delivery

Goal: every legitimate inquiry is retained and, when configured, delivered to the realtor's CRM.

Work packages:

- tenant-scoped lead model with consent/source/page/listing context, retention rules, and audit trail
- contact and listing-inquiry forms with accessible validation, spam controls, rate limiting, and
  notification email
- lead inbox and status management in the control centre
- Follow Up Boss provider implementation with connection test, idempotency, retries, and delivery
  status; retain the lead locally when CRM delivery fails
- privacy/consent surfaces suitable for Canadian customers, informed by legal review

Acceptance criteria:

- a submitted lead is durably stored before external delivery is attempted
- duplicate submissions/retries do not create uncontrolled CRM duplicates
- failures are visible and retryable without losing the inquiry
- sensitive fields are excluded from logs and access is tenant-authorized

### M5 — Domains and publication routing

Goal: every site receives a reliable platform address and can safely attach a custom domain.

Work packages:

- reserve and provision unique Realtr subdomains during onboarding
- domain state machine: pending, verifying, verified, active, error, detached
- ownership challenge and DNS inspection, background verification, CNAME/A guidance, primary-domain
  selection, redirects, and removal
- harden Caddy's on-demand TLS allow endpoint against unauthorized issuance and abuse
- production URL generation based on configured scheme/hosts, not development port assumptions

Acceptance criteria:

- a new site is reachable on its platform subdomain without operator action
- an unverified domain cannot be served or approved for certificate issuance
- domain ownership, conflicts, DNS propagation, primary redirects, and detach/reattach are tested
- certificate/routing failures surface actionable status without exposing internal details

### M6 — Billing, plans, and entitlements

Goal: customers can start, pay for, change, and cancel a subscription with predictable access.

Work packages:

- define plans, trial policy, and entitlements for sites, custom domains, integrations, members, and
  templates before implementing UI
- Stripe customer/subscription/checkout/portal integration with signed, replay-safe webhooks
- local subscription state and an entitlement service used by server-side mutations and workers
- trial, failed-payment, grace-period, cancellation, and reactivation behavior
- Canadian tax/invoice configuration validated with accounting/legal advice

Acceptance criteria:

- webhook replays and out-of-order delivery converge to correct subscription state
- paid capabilities are enforced server-side, not only hidden in UI
- cancellation or payment failure follows documented site/data retention behavior
- support can reconcile a tenant to its billing customer and event history

### M7 — Operations, reliability, and launch

Goal: operate the MVP safely for paying customers.

Work packages:

- internal `apps/admin` for tenant, domain, integration, sync, lead-delivery, and subscription health;
  privileged actions require audit logs and least-privilege access
- structured logs, request/job correlation, error reporting, metrics, dashboards, and alerts
- backups plus restore drills, migration/rollback runbooks, secret rotation, and incident procedures
- security review covering tenant isolation, SSRF/DNS/domain risks, auth, webhooks, forms, dependency
  scanning, and encryption/key rotation
- accessibility, performance, browser/device, load, and failure-mode testing
- privacy policy, terms, data export/deletion, retention, support workflow, and DDF launch approval

Acceptance criteria:

- an operator can diagnose a failed publish, domain activation, listing sync, CRM delivery, or billing
  transition from recorded telemetry
- restore and rollback procedures have been exercised in a non-production environment
- critical security findings are resolved and launch/compliance approvals are recorded
- a pilot cohort can onboard and operate without direct database intervention

## First dispatch queue

These are deliberately small, reviewable packages. Dispatch them in order unless their dependency
is already merged.

Fresh-context implementation contracts for this queue live in `docs/agent-tasks/README.md`. The
packet index is authoritative for readiness, dependencies, collision notes, and dispatch order; the
summary below explains the intended slices at roadmap level.

1. `M0-C1 — Test foundation`: add the selected runner, database fixture lifecycle, and commands to
   root/workspace manifests. Prove it with host normalization and two-tenant database fixtures.
2. `M0-A1 — Authorization inventory and guard`: document every authenticated entry point, implement
   a reusable session/member/org guard in the appropriate server-only package, and test it with two
   tenant fixtures. Do not expand into UI redesign.
3. `M0-A2 — Secure domain mutations`: make add/remove/primary-domain operations use the guard and
   constrain site/domain queries by organization. Initially only `addDomain` exists; add negative
   tests before extending the API.
4. `M0-E1 — Listing identity migration`: change uniqueness to include `organizationId`, add a
   regression test, and verify fresh and upgraded schemas.
5. `M0-F1 — Worker lifecycle`: schema-validate jobs and env, remove implicit demo enqueue, add
   graceful shutdown, and test unknown-provider/error behavior.
6. `M0-G1 — UI system spike` (parallel): validate ADR 0001 by configuring shadcn/ui for the
   monorepo and implementing Button, Field/Input, Select, Dialog, Dropdown Menu, Tooltip, and Toast
   in an isolated branch or worktree. Include a component-workbench page and visual/a11y evidence;
   do not migrate product screens until the review checkpoint is approved.
7. `M3-D1 — DDF discovery brief` (non-code, parallel): record official access/compliance answers,
   open decisions, sanitized fixture availability, and their implications for the canonical model.
8. `M2-D1 — Draft/publish ADR` (parallel): propose storage/versioning,
   concurrency, preview tokens, cache invalidation, and migration strategy before editor UI work.
9. `M0-D1 — CI baseline`: install, cache pnpm, run checks/tests/build, and detect generated migration
   drift after the canonical test and root commands settle. Keep production secrets and external
   services out of pull-request checks.

Each dispatch should quote its work-package ID, list allowed/shared files, and require the agent to
return evidence against the stated milestone acceptance criteria. Avoid assigning two agents the
same migration, manifest, generated route tree, or shared registry at once.

## Decisions to record before implementation

Use short architecture decision records under `docs/decisions/` for choices that constrain several
workstreams. The first needed decisions are:

- test runner and PostgreSQL integration-test lifecycle
- authorization API and active-organization semantics
- draft/published site document and revision storage
  ([ADR 0004](decisions/0004-draft-publish-site-documents.md), proposed)
- canonical listing model after DDF discovery
- platform subdomain and production host strategy
- plan/entitlement model and billing lifecycle
- asset upload/storage/image transformation provider
- UI system and visual quality workflow (proposal: `docs/decisions/0001-ui-system.md`)
- user-supplied templates: tiered approach, code templates deferred
  ([ADR 0005](decisions/0005-user-supplied-templates.md), accepted)
- deployment target beyond the current single-host Docker topology

An ADR should state context, decision, alternatives considered, consequences, and follow-up work.
Do not use an ADR to postpone a local, easily reversible implementation detail.

## MVP boundary

Included for the first paying pilot: solo-realtor onboarding, one site, core pages/blocks, theme and
content editing, safe publishing, platform and one custom domain, DDF connection/sync, listing
browse/detail, lead capture, email notification, Follow Up Boss delivery, subscription billing, and
essential operator visibility.

Deferred unless pilot evidence changes priority: brokerage hierarchies beyond schema compatibility,
multiple listing providers, multiple CRMs, OAuth/social login, a large template marketplace,
advanced analytics, custom code, multilingual editing, and customer-facing domain registration or
purchase. Custom-domain connection is MVP; acting as a registrar is not.

User-supplied templates follow [ADR 0005](decisions/0005-user-supplied-templates.md): saved-preset
(Tier 1) and configurable-layout (Tier 2) templates are accepted in principle but scheduled for
later M2/post-MVP slices, and code or sandboxed-markup templates (Tier 3) are out of the MVP
boundary pending their own ADR.
