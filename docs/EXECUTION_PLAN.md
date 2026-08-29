# Realtr execution plan

Status: updated 2026-08-28. Update this document as decisions are made and slices land; it is the
coordination source for dispatched agents, not a promise of dates.

Progress snapshot (2026-08-28): M0–M3 are implemented and verified in-app; the site editor, DDF
listing sync, and public listing pages work end-to-end. Built on top since: a sidebar dashboard,
featured listings, **exclusive (manual) listings** with **S3-compatible asset upload** (SeaweedFS in
dev), **dark mode**, and **teams & users** — RBAC (owner/admin/agent via better-auth access-control),
agent invitations, and agent profiles showcased on the site. Since then M4 (leads/CRM), M5 (domain
verification automation), and M6 (billing/entitlements) have all landed — see the milestone status
table below. M7 operations/launch hardening is in progress (admin console + audit log landed).

## Product outcome

A Canadian realtor can sign up without assistance, create a polished branded website, connect a
REALTOR.ca DDF feed, edit and preview content, publish on a Realtr subdomain or a verified custom
domain, receive leads, and pay for the service. Realtr operators can understand tenant, domain,
sync, and subscription health without directly editing production data.

## Current baseline

Delivered and verified in-app:

- pnpm/TypeScript monorepo (control centre, tenant renderer, marketing, worker) with a test harness
  (unit + disposable-PostgreSQL integration) and CI quality gates
- passwordless Better Auth with organization/member RBAC (owner/admin/agent) via access-control, a
  reusable authorization guard, agent invitations, and audit events on key mutations
- sidebar control-centre dashboard (shadcn/ui, dark mode) with onboarding that provisions a draft site
- Puck site editor with versioned draft/publish, preview tokens, rollback, theme/settings and
  page/navigation editors, a second template, and renderer SEO (canonical/OG/JSON-LD/sitemap/robots)
- DDF listing sync (typed client, incremental + reconcile, encrypted per-tenant config, scheduler +
  manual sync, super-admin console) persisting a tenant-scoped canonical listing model
- public listing grid/detail with REALTOR.ca attribution (source-aware) and preserved watermarks
- listings management: featured curation (survives re-sync), exclusive/manual listings with full CRUD
- agent profiles showcased via a Team block + `/agents/$slug` pages
- S3-compatible asset storage (`@aws-sdk/client-s3`; SeaweedFS in dev, any endpoint in prod)
- host→domain→site resolution, Caddy on-demand TLS check, platform subdomains
- Docker development (Postgres + SeaweedFS) and single-host production topology

Remaining gaps that affect sequencing:

- lead capture forms, lead inbox, distribution rules, and deal-flow pipeline are unbuilt (only the
  `lead` table + repository seam exist); Follow Up Boss CRM provider is still a stub
- the production host/subdomain strategy hardening (ADR 0007 shared cert storage, CDN) is ops-side work
- product analytics is not implemented (production magic-link email via Resend is now wired, M7-A8)
- multiple sites per organization and better-auth sub-teams are deferred (schema seams exist)

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

## Milestone status (2026-08-28)

| Milestone | Status | Notes |
|---|---|---|
| M0 Safety + delivery foundation | done | authz guard, validation, test harness, CI, tenant-scoped listing identity, worker lifecycle, UI system |
| M1 Account + onboarding | done | passwordless auth, onboarding→draft site, RBAC (owner/admin/agent), member profiles, invitations, audit events, and production magic-link email (Resend, M7-A8). Remaining: org switcher (single-org today) |
| M2 Site builder + publishing | done | pages/nav/SEO, draft/publish + rollback, Puck editor, theme/settings editor, 2 templates, sitemap/robots/JSON-LD |
| M3 Listings + DDF | done | client, sync engine, persistence, scheduling, connect UI, public rendering, ops console. Post-MVP **M3-B Technology-Provider** track (deduped feed, per-`DestinationId` entitlement) still open (ADR 0006) |
| M3.5 Listings mgmt + teams (this session) | done | sidebar dashboard, dark mode, featured listings, exclusive listings + S3 asset upload, RBAC/invitations/agent profiles + Team block |
| M4 Leads + CRM | done | Capture (contact + listing-inquiry forms, store-before-deliver, honeypot/rate-limit/consent), inbox (role-scoped list + status pipeline + delivery status/retry), distribution (auto-route to listing agent; owner/admin reassign), **new-lead notification email** (worker sweep), and **Follow Up Boss delivery** (connect/test UI, worker delivery with retain-on-failure + retry) shipped and verified. Production email transport (Resend) shipped in M7-A8 (shared by lead notifications + M1 magic links) |
| M5 Domains | partial | resolution, on-demand TLS, platform subdomains, secured add/remove. Verification/status automation + production host strategy remain |
| M6 Billing + entitlements | done | ADR 0008 accepted (Stripe hosted Checkout/Portal, webhook re-fetch-and-converge, Solo/Team + per-seat, card-required trial, 7-day grace). **M6-A1 done**: subscription/billing_event mirror (migration 0014), plan catalog + pure `resolveEntitlements` in `@realtr/core`, `billing` RBAC resource — wired permissive. **M6-A2 done**: Stripe Checkout behind an injectable gateway port (offline-tested), subscription-mirror repo + customer provisioning, billing page/card + `billing:manage` gate. **M6-A3 done**: signed raw-body webhook (`/api/billing/webhook`) with event-id ledger + re-fetch-and-converge (replay- and order-safe), Stripe→local status mapping + grace-deadline anchoring, mirror upsert as the sole writer; convergence unit-tested offline + db ledger/upsert integration test. **M6-A4 done**: Customer Portal link (server fn + Stripe adapter), pure grace→lapse sweep engine + guarded repo + hourly worker job (past_due past graceEndsAt becomes lapsed), and a dunning banner on the billing page. **M6-A5 done**: enforcement flip — one `loadEntitlements` seam gating publish/rollback, add-domain, connect-integration (CRM + DDF), invite-member, public site serving (`resolvePublishedSite` → suspended/402), and lead capture; Team seat rules (`evaluateInvite` hard-cap/confirm-charge) + best-effort Stripe seat-quantity sync on membership change. **M6-A6 done**: super-admin billing reconciliation (tenant ↔ Stripe customer/subscription + recent event history) with an extend-grace action. M6 complete. |
| M7 Operations + launch | in progress | **M7-A1 done**: admin operations console — a tenant health board (subscription/domains/integrations/listings/leads/sync at a glance) + platform audit log (`admin_audit_event`, migration 0015) wired into every privileged super-admin action. **M7-A2 done**: per-tenant drill-down levers (domain re-verify/detach, retry failed lead deliveries, pause/resume sync), all org-scoped + audited. **M7-A3 done**: structured logging (`@realtr/core/log`, JSON in prod), per-job correlation ids + start/finish/error events across all worker jobs, and a single `reportError` seam (Sentry-ready) on the worker + billing critical paths. **M7-A5 done**: pre-launch security review (`docs/security-review-2026-08.md`) — fixed magic-link-in-prod-logs + hardcoded auth-secret fallback + added CSRF `trustedOrigins`; verified tenant isolation / domain uniqueness / webhook signatures / XSS escaping / credential encryption; tracked drizzle-orm upgrade + rate-limiter + ops items. **M7-A7 done**: owner data export (redacted JSON) + tenant erasure (cascade, audited) via Dashboard → Data & privacy; `docs/data-handling.md` + `docs/legal/` (privacy/terms templates for counsel + DDF launch checklist). **M7-A8 done**: production email (Resend) — magic-link sign-in + lead notifications now send in prod; dev logs; prod-without-key reports without leaking. Remaining: A6 a11y/perf/load; A4 backups+runbooks (docs, deferred to end); the tracked security follow-up (drizzle-orm >=0.45.2) is done — see docs/security-review-2026-08.md T1 |

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

MVP credential model — [ADR 0006](decisions/0006-ddf-credential-model-mvp.md), accepted: tenants
self-provision their own DDF Web API key (OAuth client credentials) for their own Member Website
Feed and connect it to Realtr. This unblocks the sync engine, connect UI, and (with a pilot key) the
canonical model; the display/attribution/refresh/deletion obligations still apply.

The tenant-supplied-key model is a **deliberate MVP stepping stone.** The retained north star is
Realtr as a CREA **Technology Provider** consuming a single provider-wide **deduplicated** feed with
per-`DestinationId` entitlement (and the National Shared Pool) — a standing **post-MVP M3-B track**,
not a maybe. ADR 0006 lists the seams every MVP slice must preserve so that move is additive, not a
rewrite (persist `ListingKey` as the cross-tenant dedup identity; drive removal by master-list
membership; keep the sync engine behind a repository port; keep config provider-account-shaped).

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

Status (2026-08-28): **capture, inbox, and distribution are built and verified**; CRM delivery and
notification email remain. Shipped:

- **Capture** — the Contact block is a real form and listing detail pages carry an inquiry form; both
  native-POST to a renderer `/api/lead` endpoint. `captureLead` (`@realtr/core`) resolves host→tenant,
  screens (honeypot, field cleaning, contact-required, email syntax), rate-limits per org+IP, and
  **stores before any delivery**. Pure screening is DB-free in `leads-screen.ts` (unit-tested).
- **Distribution** — a listing inquiry resolves its `sourceListingId` to the canonical listing
  (`resolveListingRef`), links `listingId`, and auto-routes to the listing's agent; a stale ref still
  stores the inquiry, unlinked. Owner/admin reassign in the inbox (`assignLeadFn`, org-membership
  guard on the target); agents cannot assign.
- **Inbox** — `/leads` dashboard page: role-scoped list (admins all, agents own), status pipeline
  (`new→contacted→qualified→won→lost`) via `updateLeadStatusFn`, filter, empty states. Repo gained
  `updateLeadStatus` (optional agent-scoped write).

Also shipped:

- **Notification + delivery** run in the worker via a 1-minute pg-boss sweep (`runLeadDelivery`):
  it emails the realtor (owner + assigned agent) once (`notifiedAt` guard) and delivers to the
  connected CRM, persisting `deliveryStatus` (pending/delivered/failed/skipped) so failures are
  visible in the inbox and retryable (owner/admin `retryLeadDelivery`). Store-before-deliver holds:
  a failed CRM push retains the lead.
- **Follow Up Boss** — `pushLead`/`testConnection` against the real API (Basic auth, injectable
  fetch, offline contract tests), a connect/test/disconnect card on the Integrations page, and
  encrypted per-tenant config reusing the `integration` table (`kind="crm"`).

Remaining / deferred:

- production email transport (Resend) — `sendEmail` logs today; wire the real provider (shared with
  M1 magic links). Marked with a `ponytail:` note in `packages/core/src/email.ts`
- privacy/consent surfaces suitable for Canadian customers, informed by legal review (a consent
  checkbox is captured today; retention rules and a policy surface are not)

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

Historical (this queue is complete as of 2026-08-28 — see the Milestone status table above and
`docs/agent-tasks/README.md` for current state and suggested next packets). Kept for provenance.

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

- test runner and PostgreSQL integration-test lifecycle — decided (implemented)
- authorization API and active-organization semantics — decided; RBAC roles owner/admin/agent via
  better-auth access-control (`apps/app/src/lib/permissions.ts`). A member's role is independent of
  whether they are showcased on the site (a visible agent profile). Not yet an ADR — worth recording.
- draft/published site document and revision storage
  ([ADR 0004](decisions/0004-draft-publish-site-documents.md), accepted, implemented)
- canonical listing model after DDF discovery — decided (implemented; tenant-copy behind a repo port)
- DDF credential model for MVP: tenant-supplied API keys
  ([ADR 0006](decisions/0006-ddf-credential-model-mvp.md), accepted, implemented)
- asset upload/storage/image transformation provider — decided: S3-compatible via `@aws-sdk/client-s3`
  (SeaweedFS in dev, any endpoint in prod), served directly from the store; manual-listing/profile
  images only (DDF media stays on source URLs). Not yet an ADR — worth recording (proposed ADR 0007).
- platform subdomain and production host strategy — partial; needs an ADR
- plan/entitlement model and billing lifecycle — open
- UI system and visual quality workflow (proposal: `docs/decisions/0001-ui-system.md`) — accepted
- user-supplied templates: tiered approach, code templates deferred
  ([ADR 0005](decisions/0005-user-supplied-templates.md), accepted)
- reverse proxy, custom-domain TLS, and deployment scale-out path
  ([ADR 0007](decisions/0007-deployment-topology-and-tls.md), accepted: Caddy on-demand TLS now,
  phased state-externalizing path to multi-node, Cloudflare-for-SaaS as the scale upgrade)

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
