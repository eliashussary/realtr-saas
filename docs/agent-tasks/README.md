# Agent task packets

This directory turns the milestones in `docs/EXECUTION_PLAN.md` into bounded work that an agent can
execute with fresh context. The execution plan owns product sequencing; these packets own the
implementation contract for one slice.

## Required reading order

Every assigned agent starts by reading, in order:

1. `AGENTS.md`
2. `README.md`
3. this file
4. the assigned task packet
5. every ADR or source file listed under that packet's **Required context**

Do not assume conversational context, undocumented decisions, or the state of another agent's
worktree. Inspect the repository and git status before acting.

## Status vocabulary

- `ready`: dependencies are present and the task may be dispatched
- `blocked`: a named dependency or decision is missing
- `in progress`: one agent owns the task; do not dispatch a second agent onto it
- `review`: implementation is complete but acceptance evidence has not been approved
- `done`: acceptance criteria and handoff evidence have been approved

Only the coordinating agent or product owner changes task status. An implementing agent reports
evidence; it does not declare its own packet approved.

## Initial queue

| Order | Packet | Status | Depends on | Parallelism notes |
|---:|---|---|---|---|
| 1 | [M0-C1 Test foundation](M0-C1-test-foundation.md) | done | — | Canonical commands and two-tenant fixtures established |
| 2 | [M0-A1 Authorization guard](M0-A1-authorization-guard.md) | done | M0-C1 | Shared authorization contract and cross-tenant tests established |
| 3 | [M0-A2 Secure domain mutations](M0-A2-secure-domain-mutations.md) | done | M0-A1 | Implementation verified; manual flow evidence remains |
| 4 | [M0-E1 Listing identity migration](M0-E1-listing-identity-migration.md) | done | M0-C1 | Tenant-scoped constraint and regression tests established |
| 5 | [M0-F1 Worker lifecycle](M0-F1-worker-lifecycle.md) | done | M0-C1 | Lifecycle, readiness, shutdown, and zero-startup-job evidence approved |
| 6 | [M0-G1 UI system spike](M0-G1-ui-system-spike.md) | done | ADR 0001 | Approved 2026-08-27 (Shopify Red palette); UI system unblocks A7 |
| 7 | [M3-D1 DDF discovery brief](M3-D1-ddf-discovery-brief.md) | done | — | Production DDF client/model blocked on CREA answers |
| 8 | [M2-D1 Draft/publish ADR](M2-D1-draft-publish-adr.md) | done | — | ADR 0004 and its MVP defaults were accepted |
| 9 | [M0-D1 CI baseline](M0-D1-ci-baseline.md) | done | C1 and stable root scripts | Hosted quality and PostgreSQL jobs pass on main |
| 10 | [M2-A1 Site document contract](M2-A1-site-document-contract.md) | done | ADR 0004 | V1 contract, legacy conversion, compatibility tests, and repository gates pass |
| 11 | [M2-A2 Site document persistence](M2-A2-site-document-persistence.md) | done | M2-A1 | Fresh/upgrade migrations, idempotent backfill, and tenant constraints pass |
| 12 | [M2-A3 Tenant-scoped draft API](M2-A3-tenant-scoped-draft-api.md) | done | M2-A1, M2-A2, M0-A1 | Authorized load, CAS autosave, typed conflicts, audit events, atomic onboarding, two-tenant tests pass |
| 13 | [M2-A4 Publication service](M2-A4-publication-service.md) | done | M2-A2, M2-A3 | Locked atomic publish/rollback, publication pointer, permission gate, audit, failure/cross-tenant tests pass |
| 14 | [M2-A6 Secure preview](M2-A6-secure-preview.md) | done | M2-A2, M2-A3 | Hashed expiring revocable grants, renderer preview route with no-store/noindex, cross-tenant tests pass |
| 15 | [M2-A5 Renderer cutover](M2-A5-renderer-cutover.md) | done | M2-A2, M2-A4 | Revision-only host rendering, multipage/redirects/404, fail-closed 404/503, ETags; unit + integration tests pass |
| 16 | [M2-A7 Editor & publishing UI](M2-A7-editor-publishing-ui.md) | done | M2-A3/A4/A6, M0-G1 | Puck editor, CAS autosave + save states/conflict, page switch, publish/preview controls; check + build pass |
| 17 | [M2-A9 Theme & settings editor](M2-A9-theme-settings-editor.md) | done | M2-A7 | Editable theme/brand/contact/social via CAS autosave; schema-safe value cleaning; check + test + build + CSS budget pass |
| 18 | [M2-A10 Page & navigation management](M2-A10-page-navigation-management.md) | done | M2-A7 | Editable pages/slugs/SEO/status, menu, and redirects via CAS autosave; id-keyed canvas; navigation rendered end-to-end; check + test + build + CSS budget pass |
| 19 | [M2-A11 Template selection](M2-A11-template-selection.md) | done | M2-A7 | Second template (classic) + editor picker; in-place switch preserves content/theme; shared block set with compatibility tests; check + test + build + CSS budget pass |
| 20 | [M2-A12 Renderer SEO & discovery](M2-A12-renderer-seo.md) | done | M2-A5, M2-A10 | Canonical + Open Graph/Twitter + JSON-LD; per-site sitemap.xml and robots.txt (fail-closed); renderer test runner added; check + test + build + CSS budget pass |
| 21 | [M3-A1 DDF client](M3-A1-ddf-client.md) | done | M3-D1 | New @realtr/ddf: OAuth + OData pagination + replication + retry, injectable I/O, synthetic fixtures + contract tests; offline, no live calls |
| 22 | [M3-A2 Listing-source contract v2](M3-A2-listing-source-contract.md) | done | M3-A1 | verify/sync/listEntitlement contract; enriched NormalizedListing; DDF source + normalizer on @realtr/ddf; worker handler updated |
| 23 | [M3-A3 Sync engine + reconciliation](M3-A3-sync-engine.md) | done | M3-A2 | runListingSync over a repository port; incremental checkpoint + overlap, master-list removal, fail-safe (no checkpoint/removal on error); in-memory tested; TP seams preserved (ADR 0006) |
| 24 | [M3-A4 Listing persistence](M3-A4-listing-persistence.md) | done | M3-A3 | additive schema (sourceKey/status/timestamps + sync_state + sync_run) + migration 0007; transactional idempotent tenant-copy repository; integration tests; check + test + build pass |
| 25 | [M3-A5 Sync worker + scheduling](M3-A5-sync-worker-scheduling.md) | done | M3-A4 | config load/decrypt; sync handler runs the engine; dispatcher fans out per tenant; incremental + daily-reconcile schedules; per-credential singleton concurrency; worker tests pass without a DB |
| 26 | [M3-A6a DDF connect UI](M3-A6a-ddf-connect-ui.md) | done | M3-A5 | integration unique + migration 0008; connect/test/disconnect/status server service (encrypted creds, owner/admin gate, safe errors); dashboard ListingsCard; makes the pipeline runnable end-to-end |
| 27 | [M3-A6 Public listing rendering](M3-A6-public-listing-rendering.md) | done | M3-A6a | /listings grid + /listings/$id detail in the themed shell; canonical + OG + JSON-LD; REALTOR.ca attribution + preserved watermarks; fail-closed; view-model tested |
| 28 | [M3-A8 Sync ops + attribution asset](M3-A8-sync-ops-and-attribution-asset.md) | done | M3-A6 | manual Sync now/Reconcile; super-admin /admin console (env allowlist) with per-tenant trigger + pause/resume (sync_paused, migration 0009); official Powered-by-REALTOR.ca logo |

Dependencies take precedence over the numeric order. M0-E1 and M0-F1 may start after M0-C1 while
M0-A1/A2 proceeds. M0-G1, M3-D1, and M2-D1 are intentionally parallel tracks.

Status update (2026-08-28): the M2-A9..A12 and M3-A1..A8 packets (and M0-A2) were previously
`review`; they are now `done` — verified working end-to-end in-app this session, with the follow-on
work below built on top of them.

Feature tracks delivered without formal packets (see `docs/EXECUTION_PLAN.md` milestone status table
for the authoritative summary):

- **Listings management** — sidebar dashboard, dark mode, featured-listing curation (survives
  re-sync), and exclusive/manual listings with full CRUD.
- **Asset storage** — S3-compatible upload via `@aws-sdk/client-s3` (SeaweedFS in dev, any endpoint in
  prod), a reusable `ImageUpload` component, and a general `asset` table (migration 0011). ADR 0007
  is worth writing to record this.
- **Teams & users** — RBAC (owner/admin/agent via better-auth access-control in
  `apps/app/src/lib/permissions.ts`), agent invitations + `/accept-invite`, agent profiles, a Team
  block, and `/agents/$slug` pages. Role and "showcased on the site" are independent.
- **Leads (M4 — capture + inbox + distribution)** — public contact + listing-inquiry forms posting to
  a store-before-deliver `/api/lead` endpoint (`captureLead` in `@realtr/core`, pure screening in
  `leads-screen.ts`); a role-scoped `/leads` inbox with status pipeline; auto-routing of listing
  inquiries to the listing's agent plus owner/admin manual reassignment. Repo gained
  `updateLeadStatus`; listings repo gained `resolveListingRef`. CRM delivery + notification email are
  the remaining M4 pieces.

M4 is now complete: notification email + Follow Up Boss delivery landed via a 1-minute worker sweep
(`runLeadDelivery`) with per-lead `deliveryStatus` and inbox retry; FUB connect UI + provider (real
API, offline contract tests) shipped.

M5 (domains) landed since: state machine + DNS verification, verify wiring, the scheduled
re-verification worker, and the cert-issued→active transition (M5-A1..A5, ADR 0007). Remaining M5
tails are non-core: UI status polling and active-domain auto-demotion on later DNS breakage.

M6 (billing) is complete: A1 (entitlement model + resolver), A2 (Stripe Checkout behind a gateway
port), A3 (signed re-fetch-and-converge webhook + mirror), A4 (Customer Portal + grace→lapse worker
sweep + dunning), A5 (the enforcement flip — one `loadEntitlements` seam gating publish, add-domain,
connect-integration, invite-member, site serving, and lead capture; Team seat rules + Stripe seat
sync), and A6 (super-admin billing reconciliation + extend-grace) have all landed.

Suggested next packets: **M7** (operations, reliability, launch) is the remaining milestone —
structured logs / request+job correlation / error reporting / dashboards; backup+restore and
migration/rollback runbooks; a security review (tenant isolation, SSRF/DNS/domain, webhooks, forms,
key rotation); accessibility / performance / load / failure-mode testing; and privacy/terms/data-
export/deletion + DDF launch approval. Also open: production email transport (Resend, shared with M1
magic links); the editor-UX refactor (pages/nav as a left sidebar, template/theme as a right sidebar).

## Dispatch prompt

Use this minimal prompt so the repository remains the source of truth:

```text
Read AGENTS.md, README.md, docs/agent-tasks/README.md, and
docs/agent-tasks/<PACKET>. Execute that packet only. Inspect current repository state first,
respect its dependencies and ownership boundaries, and return the required handoff evidence.
Do not mark the task done yourself.
```

If the task is running concurrently, append the names of active packets and any explicitly reserved
files. Never ask two agents to generate migrations, route trees, lockfile changes, or edits to the
same shared registry simultaneously.

## Packet contract

Every packet defines:

- **Outcome**: the observable result, not an activity
- **Why now**: its place in the dependency graph
- **Required context**: exact decisions and code to inspect
- **Dependencies**: repository state that must already exist
- **Scope**: required work
- **Non-goals**: tempting work explicitly excluded
- **Ownership**: expected files plus shared-file collision warnings
- **Constraints**: task-specific invariants beyond `AGENTS.md`
- **Acceptance criteria**: evidence required for review
- **Verification**: commands and manual cases
- **Handoff**: the response format expected from the agent

An agent may adjust file placement when repository evidence demands it, but must explain the change
and preserve the packet's boundaries. If a missing decision would materially change architecture,
stop and report it rather than silently choosing a broad direction.

## Standard handoff

Every agent response must include:

1. outcome summary
2. files changed
3. acceptance criteria with evidence for each item
4. commands run and their exact pass/fail outcome
5. manual checks performed
6. security/tenant-isolation considerations
7. migrations, environment variables, or operator actions introduced
8. remaining risks, open decisions, and follow-up work now unblocked

If verification hangs or cannot run, report where it stopped, how long it was allowed to run, and
what narrower checks passed. Silence is not a pass.
