# ADR 0004: Versioned draft and published site documents

- Status: Accepted
- Date: 2026-08-27
- Decision owners: product owner and M2 implementers

## Context

Today `site.templateId`, `site.theme`, and `site.pages` are the complete document lifecycle. New
sites copy a template's defaults into those columns during onboarding, and the renderer resolves a
host directly to that mutable row. There is no editor yet, no distinction between draft and live
content, no version or author, and only the `/` page is rendered. A malformed write, half-completed
multi-page update, or future editor save could therefore immediately damage the public site. There
is also no deterministic stale-writer response, preview boundary, publication audit trail, or
rollback target.

Puck's persisted `Data` is a page-level value containing `content`, `root`, and (in the version
currently installed here) optional `zones`. Component instances carry a stable `props.id`. The same
`Data` is accepted by Puck's editor and `Render`; `onChange` and `onPublish` merely return data to the
application, so Realtr—not the Puck callback name—must own persistence and publication semantics.
Puck documents that breaking component-prop changes require compatibility or a prop migration and
provides a framework-data migration helper. Realtr therefore needs its own envelope schema version
and migrations in addition to any Puck migration.

Relevant official references:

- [Puck `Data`](https://puckeditor.com/docs/api-reference/data)
- [Puck editor callbacks](https://puckeditor.com/docs/api-reference/components/puck)
- [Puck `Render`](https://puckeditor.com/docs/api-reference/components/render)
- [Puck data migration](https://puckeditor.com/docs/integrating-puck/data-migration)

M0-A1's accepted server-only guard derives the authenticated user and allowed organization
membership from the session and offers an organization-constrained site lookup. No draft,
preview-token, publish, or rollback API may trust an organization, member, author, or role supplied
by the browser. M2 APIs must consume that contract rather than introduce a second authorization
system.

## Decision

Use a **mutable whole-site draft workspace, immutable whole-site revision snapshots, and one atomic
published-revision pointer per site**.

The complete site document is one versioned JSON envelope. Autosave replaces that envelope using a
compare-and-swap draft version. Preview and publish first validate and normalize the entire
envelope, then create an immutable snapshot. Publish becomes visible only by atomically changing a
single pointer. The ordinary renderer starts from that pointer and has no query path to the draft.

This model is intentionally whole-document for MVP. It gives a publish operation one consistency
boundary while still preserving stable page and block IDs that can support page-level editing or a
more granular collaboration model later.

### Data boundaries

Keep resource identity, ownership, and routing outside the versioned document:

- `site`: stable site ID, `organizationId`, optional owner, internal display name, timestamps, and
  the one-to-one document-state relationship. Domains continue to reference this stable ID.
- `domain`: hostname, verification, primary-domain, and serving state. Domain state is operational,
  not content, and is not rolled back with a document.
- asset records and integration credentials: referenced by opaque IDs only; never embedded secrets.

Version together everything whose coordinated change must appear atomically:

```ts
type SiteDocumentV1 = {
  schemaVersion: 1
  template: {
    id: string
    // Version of Realtr's template/content compatibility contract, not an npm version.
    schemaVersion: number
  }
  settings: {
    siteTitle: string
    logoAssetId?: string
    contact: { email?: string; phone?: string }
    socialLinks: Array<{ id: string; service: string; url: string }>
  }
  theme: ThemeTokens
  navigation: Array<{
    id: string
    label: string
    pageId?: string
    href?: string
    children: Array<NavigationItemV1>
  }>
  pages: Array<{
    id: string
    slug: string // canonical normalized path segment(s); home uses ""
    title: string
    status: "active" | "hidden"
    seo: { title?: string; description?: string; noIndex?: boolean }
    puck: Data
  }>
  redirects: Array<{ id: string; fromSlug: string; toSlug: string; permanent: boolean }>
}
```

Navigation is not derived from pages: ordering, labels, external links, and hidden pages are product
choices. Page metadata is separate from its Puck content so routing and SEO need not inspect block
JSON. Theme and template selection live in the document because a publish or rollback must change
them with the pages they interpret. The legacy `site.name` remains an internal control-centre label;
public title belongs in document settings.

IDs are UUIDs generated server-side for sites, pages, navigation items, redirects, revisions, and
preview grants. Puck component `props.id` remains stable across saves and compatible template
switches; boundaries reject missing or duplicate component IDs. A page ID never changes when its
slug changes. Slugs are unique within a document after Unicode/percent-decoding and canonical path
normalization; reserved and ambiguous paths are rejected. Revision IDs are opaque UUIDs and never
act as ordering. `draftVersion` and `publicationNumber` are monotonically increasing `bigint`s.
All timestamps are database-generated UTC instants. Authorship is the server-derived authenticated
user ID, with nullable `authorUserId` plus a required `actorType` for migration/system actions.

### Logical schema sketch

Names may be adjusted to repository conventions, but implementations must preserve these
constraints and transaction boundaries:

```sql
site_document_state (
  site_id uuid primary key references site(id) on delete cascade,
  organization_id text not null references organization(id) on delete cascade,
  draft_document jsonb not null,
  draft_schema_version integer not null,
  draft_version bigint not null default 1,
  draft_updated_at timestamptz not null,
  draft_updated_by_user_id text null references "user"(id) on delete set null,
  published_revision_id uuid null,
  next_publication_number bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, site_id)
)

site_revision (
  id uuid primary key,
  site_id uuid not null references site(id) on delete cascade,
  organization_id text not null references organization(id) on delete cascade,
  kind text not null check (kind in ('preview', 'published')),
  document jsonb not null,
  schema_version integer not null,
  source_draft_version bigint not null,
  publication_number bigint null,
  created_at timestamptz not null,
  created_by_user_id text null references "user"(id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'migration', 'system')),
  reason text null,
  based_on_revision_id uuid null references site_revision(id),
  unique (site_id, publication_number),
  check ((kind = 'published') = (publication_number is not null)),
  unique (organization_id, site_id, id)
)

site_preview_grant (
  id uuid primary key,
  site_id uuid not null references site(id) on delete cascade,
  organization_id text not null references organization(id) on delete cascade,
  revision_id uuid not null references site_revision(id) on delete cascade,
  token_hash bytea not null unique,
  created_by_user_id text not null references "user"(id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_used_at timestamptz null
)
```

Composite foreign keys should be used where Drizzle/PostgreSQL permits so the state pointer, grant,
and revision cannot cross site or organization boundaries. Otherwise enforce the same equality in
the transaction and integration tests. `published_revision_id` references a `published` revision
for that exact site. The draft row and revision rows repeat `organizationId` deliberately: every
tenant-owned query and index can be organization-scoped without first trusting a globally supplied
site ID.

Immutable revisions are never updated, except that retention may delete an unreferenced preview
revision after its grants expire. Published revisions are retained for the life of the site for MVP.
Store a canonical JSON representation or SHA-256 document checksum on revisions if useful for
deduplication and diagnostics; it is not an authorization or concurrency token.

### Validation and migrations

All input passes a shared server-side `SiteDocument` schema before persistence. Validation includes
envelope and template schema versions, normalized/unique slugs, page/navigation reference
integrity, unique Puck IDs, known block types, safe URL schemes, valid theme tokens, and supported
template compatibility. Browser validation is only feedback.

Persisted documents are interpreted through pure, stepwise migrations:

```text
stored envelope version -> Realtr envelope migrations -> Puck data migration per page
-> block-prop/template compatibility migrations -> current validated document
```

Migrations never mutate an immutable revision. Publish/preview/rollback write a new normalized
revision in the current schema. Renderer support covers the current schema and an explicitly
bounded set of older published schemas during rollout; an unsupported or failed migration is a
corrupt-revision failure, not permission to fall back to draft or template defaults.

### Read and write sequences

#### First site creation

In one onboarding transaction, create the tenant-scoped `site` and `site_document_state` from the
selected template defaults. Assign server-generated stable IDs, validate `SiteDocumentV1`, and set
`draftVersion = 1`, author, and timestamp. Leave `publishedRevisionId = null`. A newly provisioned
site is a private draft until the user explicitly publishes; no public domain should be servable on
content alone.

#### Load editor and autosave

1. Authorize the session and organization membership with M0-A1, then load state using both
   `organizationId` and `siteId`.
2. Return the current draft document and `draftVersion`; never return credentials or preview token
   hashes.
3. Puck `onChange` updates local state. After a short debounce and when the prior request settles,
   send the entire document plus `expectedDraftVersion` and a client save request ID.
4. Validate and normalize, then execute one conditional update:

   ```sql
   update site_document_state
   set draft_document = :document,
       draft_schema_version = :version,
       draft_version = draft_version + 1,
       draft_updated_at = now(),
       draft_updated_by_user_id = :sessionUser
   where organization_id = :authorizedOrg
     and site_id = :site
     and draft_version = :expected
   returning draft_version, draft_updated_at;
   ```

5. Zero returned rows is not retried as a blind last-write-wins save. Distinguish a stale version
   from a safe not-found/forbidden result inside the authorized query path without revealing a
   cross-tenant site's existence.

The API returns `200 { draftVersion, savedAt }` on success, `409 { code: "STALE_DRAFT",
currentDraftVersion }` for an authorized stale writer, `422` with structured validation paths for
invalid content, and the shared M0-A1 safe auth/not-found outcomes otherwise. Repeating a request ID
may return its prior success, but idempotency never bypasses the version comparison.

On `STALE_DRAFT`, stop autosave and preserve the unsaved local payload. Show “A newer version was
saved” with actions to reload the server draft (after offering a JSON/local recovery download) or
duplicate/reapply local work. MVP does not auto-merge Puck trees. A force overwrite is allowed only
as a conspicuous user action that first fetches the latest version and submits against that version;
it creates an audit event and remains tenant-scoped.

Autosave does not create a revision on every keystroke. Keep the latest draft row and create bounded
immutable recovery checkpoints on an implementation-defined time/meaningful-change cadence (for
example every five minutes) only if product approves draft-history UX. Publication and preview
snapshots are always revisions. The control centre must distinguish local changes, saving, saved,
conflict, invalid, and offline states.

#### Secure preview

1. After authorization, require the caller's `expectedDraftVersion`, validate/migrate the current
   draft, and insert an immutable `preview` revision plus a grant in one transaction.
2. Generate at least 256 random bits. Return the raw token once in a URL; store only a keyed hash or
   SHA-256 hash. Scope the grant to exactly one site and revision, set a short expiry (proposed 30
   minutes), and allow explicit revocation. Do not place document content or organization identity
   in the token.
3. The preview route resolves the token hash, expiry, revocation, site, organization, and revision
   together. It renders only that immutable revision through the same template registry/config as
   live rendering. Preview does not mean “current draft” and therefore cannot drift mid-session.
4. Send `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Robots-Tag: noindex, nofollow,
   noarchive`, and a restrictive `Referrer-Policy`. Never put preview responses in the public CDN,
   service-worker, or host/revision cache. Avoid third-party resources that could receive the full
   preview URL; strip token query parameters through an immediate same-origin exchange/cookie or
   use a token path with the same no-referrer protections.

An ordinary host request never accepts preview query parameters and never joins preview grants or
draft state. Expired, revoked, wrong-site, missing, or malformed tokens return a generic 404. Token
access is rate-limited and audited without logging raw tokens.

#### Publish and atomic multi-page publication

1. Authorize membership and publish capability; load state by organization and site and lock that
   row (`FOR UPDATE`).
2. Require `expectedDraftVersion`. If it differs, return `409 STALE_DRAFT`; publishing a stale tab is
   forbidden even if its local payload validates.
3. Validate and migrate the complete current draft, resolve referenced assets, and run template
   compatibility plus renderability checks. Do all remote/preparatory work before the database
   transaction where possible. Do not change the live pointer on any failure.
4. In one database transaction, insert one immutable `published` revision containing every page,
   setting, navigation entry, redirect, theme, and template. Allocate the next site-local
   `publicationNumber`, then conditionally update `publishedRevisionId` and the counter while the
   locked draft version still matches. Write the publish audit event in the same transaction.
5. Commit. Only then enqueue/broadcast cache invalidation keyed by site ID and the new revision ID.
   Return the revision ID, publication number, and timestamp.

The database pointer is the commit point. There is no per-page live flag and no sequence in which
some pages become live before others. A renderer request concurrent with publication observes the
entire old revision or the entire new revision under PostgreSQL statement/transaction visibility.
Failed validation, asset checks, revision insertion, pointer update, or commit leaves the last
published pointer unchanged. A post-commit invalidation failure is recoverable operational work,
not a reason to roll back the successful publication.

#### Rollback

Authorize and lock state, select a historical published revision using organization plus site, and
validate/migrate it against the currently supported renderer. Create a **new** published revision
with the next publication number, `basedOnRevisionId` pointing to the chosen revision, actor,
timestamp, and rollback reason. Atomically point live to this new revision.

Also replace the mutable draft with the normalized rolled-back document and increment
`draftVersion` in the same transaction. This prevents an old, now-inconsistent draft from being
accidentally republished and deliberately causes open editors to receive `STALE_DRAFT`. Historical
rows are never edited and publication numbers are never reused.

#### Template-switch preview

A template choice is a draft document change, never a mutation of live rendering. Run a pure
compatibility analysis over every page:

- preserve page IDs, slugs, metadata, navigation IDs, and all core block instances whose stable
  contracts the target template supports;
- apply explicit, versioned block-prop migrations where required;
- identify template-exclusive unsupported blocks and lossy changes before saving;
- never silently drop content. Require confirmation for a documented lossy conversion, preferably
  copying unsupported data into a recoverable holding structure or retaining it until replaced.

Save the converted whole draft by compare-and-swap, issue an immutable preview revision, and publish
through the normal validation path. Canceling the preview leaves the prior draft untouched if the
conversion was not saved. Switching back should preserve compatible content and stable Puck IDs.

### Renderer, caching, and failure behavior

An ordinary request resolves a normalized host only through an explicitly servable domain, joins
to `site_document_state.publishedRevisionId`, and fetches that exact revision constrained by site
and organization. It routes and renders solely from the revision document. It must not read
`draftDocument`, use the mutable legacy columns, or fill missing public content from template
defaults.

Use two cache layers with revision-aware keys:

- a short-lived host mapping cache: normalized host -> `{ organizationId, siteId,
  publishedRevisionId, domainState }`;
- an immutable revision cache: `{ siteId, publishedRevisionId, documentChecksum/schemaVersion }` ->
  validated document/render input, with a long TTL because revision contents never change.

On successful publish/rollback/domain changes, invalidate the host/pointer key after commit. The
new revision gets a new cache key and cannot collide with the old content. Invalidation delivery is
at-least-once and idempotent. For MVP, cap the host-mapping TTL (proposed 30 seconds) so a missed
event self-heals; stronger immediacy can use a database outbox in the implementation packet. HTTP
responses should use revision-derived ETags. Preview bypasses all public cache paths.

Failure rules are fail-closed and preserve the last known valid publication:

- no published pointer: return an unpublished 404; do not serve draft/default content;
- corrupt/missing pointed revision: log a structured, non-PII error with site and revision IDs,
  alert operations, evict the bad cache entry, and retry the authoritative database once;
- still missing/corrupt: return a generic 503 (or branded unavailable response), never draft;
- a newly attempted corrupt revision cannot become pointed because validation precedes insertion;
- if corruption is discovered after prior publication, an operator uses the audited rollback path
  or a narrowly authorized pointer-repair runbook to a previously validated published revision.

“Serve the last valid published revision” means the pointer moves only after full validation and an
atomic commit; it does not mean silently scanning history on every request. Optional last-known-good
in-memory data may cover a transient database outage only when its revision was previously
validated, its tenant/site/host binding still matches a cached explicitly servable domain, and a
bounded stale policy is approved. Never cross a domain-state change with stale content.

### Revision retention and audit

- Retain all published/rollback revisions for MVP. They are the customer-visible audit and recovery
  chain; legal/product retention may later set a minimum period.
- Preview grants expire automatically. Delete expired, unreferenced preview revisions after a
  proposed 7-day diagnostic window.
- If draft checkpoints are approved, keep a proposed 30 days or last 100 per site, whichever is
  smaller; never delete a revision referenced by a grant, publication, audit event, or rollback.
- Emit tenant-scoped audit events for save conflicts/forced overwrites, preview issue/revoke,
  publish, rollback, migration, and template conversion. Do not log document JSON, tokens, contact
  data, or other personal content.

Storage growth is linear in snapshots. Whole-document snapshots intentionally trade space for
simple, reliable reads and recovery. Add size metrics and per-document limits before general
availability; compression/deduplication can be added behind the immutable revision contract.

## Alternatives considered

### Two mutable JSON columns (`draft` and `published`) on `site`

This is the smallest schema and gives simple reads, but overwriting `published` destroys history,
rollback requires an extra ad hoc store, authorship is unclear, and corruption or operator mistakes
are hard to recover. Adding revisions later changes APIs and cache identity. It has low query
complexity and storage but weaker write safety and operational recovery, so it is rejected.

### Normalized mutable pages plus per-page revisions/publication pointers

This makes single-page autosaves small and enables page-level collaboration and history. However,
atomic multi-page publication needs a release/manifest table anyway; theme, navigation, template,
and settings still need coordinated versions. Reads require assembling and validating many rows,
partial failures are easier to create, and rollback of a coherent site state is harder to reason
about. It scales better for concurrent editors and can be introduced behind a future snapshot
builder, but its MVP complexity is not justified.

### Event sourcing every editor operation

An append-only operation log gives rich collaboration, merge, and audit possibilities. It also
requires deterministic reducers, compaction, schema evolution for old operations, and much more
complex recovery/render projections. Puck emits useful changes but Realtr does not need real-time
multi-user editing for MVP. Rejected now; stable IDs and immutable snapshots leave a future path.

### Selected model: mutable workspace plus immutable snapshots

Compared with the alternatives, it uses one simple renderer join and one JSON read, has explicit
compare-and-swap write safety, makes publication/rollback operationally obvious, and supports
future collaboration by replacing only the draft workspace implementation. Its costs are larger
autosave payloads, coarse conflicts, JSON validation responsibility, and whole-snapshot storage.

## Consequences

- Draft and public data have mechanically separate query paths; public rendering cannot
  accidentally observe an in-progress autosave.
- Multi-page publication and rollback each have one database commit point and immutable evidence.
- Stale tabs surface a recoverable conflict rather than silently winning.
- Every renderable revision carries the template/theme/content versions needed to interpret it.
- MVP autosaves and conflicts are whole-site, so even edits to different pages can conflict. Stable
  page/block IDs make a later page-level workspace or merge algorithm possible without changing
  the publication snapshot contract.
- JSON documents need strict size limits, validation, migrations, observability, and fuzz/fixture
  testing. PostgreSQL JSONB is storage, not a validation boundary.
- Cache invalidation is simple because content keys are immutable; pointer freshness still needs a
  bounded TTL or durable outbox.

## Staged migration from `site.theme` and `site.pages`

1. **Contract preparation:** define `SiteDocumentV1`, validators, canonicalization, migrations, and
   legacy conversion in `packages/site`. Add fixtures for seeded and onboarded shapes before any DB
   cutover. No renderer behavior changes yet.
2. **Additive schema:** add state/revision/grant tables and nullable relationships. Keep legacy
   columns as the active read/write source. Deploy code that can dual-read for diagnostics only.
3. **Backfill:** per site and organization, map `templateId`, `theme`, and `pages` into a V1 envelope.
   Map legacy route keys to stable page UUIDs (`/` -> slug `""`), preserve Puck component IDs, and
   synthesize settings/navigation deterministically. Validate and checksum. In one transaction per
   valid existing site, create the draft state **and** a migration-authored published revision and
   pointer so already served seeded/onboarded sites do not go offline. Record failures without
   changing that site's legacy path; never publish an invalid conversion.
4. **Reconcile:** rerun idempotently using a migration marker/checksum, compare legacy and converted
   render fixtures, and require zero unresolved invalid sites. Concurrent legacy writes must be
   prevented during final reconciliation or captured by dual-write with matching checksums.
5. **Renderer cutover:** read only the published pointer/revision behind an operational flag. A
   site without a successfully backfilled pointer remains on the explicitly monitored legacy path
   only during the bounded rollout, not on draft/default data. Verify host isolation and cache keys.
6. **Writer cutover:** create new sites as private V1 drafts and enable CAS autosave, preview,
   publish, and rollback. Stop writes to legacy columns.
7. **Removal:** after rollback window and production reconciliation, remove the legacy fallback and
   only then drop `site.templateId`, `site.theme`, and `site.pages` in a separate migration packet.

The current seed and onboarding defaults are known-valid source fixtures and must have explicit
tests. New sites created after writer cutover are not auto-published; existing sites receive a
migration-authored initial publication solely to preserve current public behavior.

## Deterministic scenario walkthrough

| Scenario | Source of truth | Deterministic result and recovery |
|---|---|---|
| First site | state row draft v1, no pointer | Private until explicit first publish |
| Autosave | draft document + CAS version | Entire validated document advances by one version |
| Stale tab | database draft version | 409, autosave pauses, local data preserved; no overwrite |
| Preview | immutable revision named by scoped grant | Exact snapshot, no public caching, expiry/revocation enforced |
| First publish | new revision + pointer transaction | All pages become live together; failure leaves unpublished |
| Multi-page update | one document/revision | Old or new complete site, never a page mixture |
| Failed publish | unchanged pointer | Validation/transaction error shown; last live revision remains |
| Rollback | new revision based on historical revision | Auditable new publication and draft reset/version bump |
| Template switch | converted draft then preview revision | Compatible IDs/content retained; losses require confirmation |
| Request during publish | MVCC-visible pointer | Complete old revision or complete new revision |

## Failure and security checklist

- **Concurrency:** conditional `draftVersion` writes and publish locks; no blind retry.
- **Partial publish:** one snapshot and pointer transaction; preparation cannot change live state.
- **Corrupt draft:** 422 and preserved previous draft; cannot preview or publish.
- **Missing/corrupt published revision:** authoritative retry then generic unavailable response and
  alert; never draft/default fallback.
- **Rollback:** append-only new publication and draft version bump.
- **Preview leakage:** hashed, scoped, expiring, revocable grants; generic failures; no-store/noindex;
  public route ignores preview inputs.
- **Cache invalidation:** post-commit revision-keyed invalidation plus bounded pointer TTL; immutable
  content keys cannot mix revisions.
- **Tenant isolation:** every authenticated read/write uses server-derived membership and
  `(organizationId, siteId)`; every public/grant join proves host/token, site, organization, and
  revision agreement.

## Implementation packets and dependency order

1. **M2-A1 — Document contract and compatibility:** implement V1 types/validators, canonicalization,
   template/block migration registry, legacy converter, size limits, and fixture tests. Depends on
   this ADR only; coordinate package-site ownership.
2. **M2-A2 — Additive persistence and backfill:** schema/migration, composite tenant constraints,
   immutable revision repository, idempotent legacy backfill, fresh/upgrade tests. Depends on A1
   and must be the sole migration owner.
3. **M2-A3 — Tenant-scoped draft API:** consume accepted M0-A1 guard; editor load/CAS autosave,
   typed conflicts, audit events, and two-tenant negative tests. Depends on A1/A2 and M0-A1.
4. **M2-A4 — Publication service:** validation, transaction/locking, atomic pointer, rollback, audit,
   failure injection tests, and publication permission. Depends on A2/A3.
5. **M2-A5 — Renderer cutover and cache contract:** revision-only host rendering, multipage routes,
   ETags, invalidation/outbox decision, corrupt/missing behavior, and legacy rollout flag. Depends on
   A2/A4; coordinates with M5 domain serving.
6. **M2-A6 — Secure preview:** grant issue/revoke/resolve, headers, rate limits, no-cache routing,
   token-redaction tests, and cross-tenant/wrong-site negative cases. Depends on A2/A3 and may run
   beside A4 after interfaces settle.
7. **M2-A7 — Editor/publish UX:** Puck integration, save states/conflict recovery, history,
   publish/rollback confirmation, responsive preview, and template-switch compatibility reporting.
   Depends on A3/A4/A6 and the approved UI-system checkpoint.
8. **M2-A8 — Legacy removal:** reconcile production, remove fallback/dual-write, then separately
   drop legacy columns. Depends on successful A5 rollout and an approved rollback window.

Each persistence/API packet includes an organization-A-cannot-access-organization-B case. A4/A5
include renderer requests during publication and injected failures before and after commit.

## Accepted MVP product defaults

Accepted on 2026-08-27. These defaults may be revisited through a later decision:

1. New sites remain private until explicit first publish; only legacy
   sites receive a migration-authored publication.
2. Owners/admins may publish and rollback; editors may autosave and issue previews.
3. Preview links live for 30 minutes, are revocable, and resolve one immutable snapshot. A separate
   signed-in-only preview is not required for MVP.
4. Published revisions are retained for the life of the site for MVP. Preview snapshots are retained
   for 7 days. If draft checkpoints ship, retain 30 days or the latest 100 per site, whichever is
   smaller, subject to later contractual deletion requirements.
5. MVP does not require draft checkpoint history beyond publication history.
6. Conflict recovery is reload, download, and manual reapply; structural merge and page locks are
   out of scope.
7. Published content may take up to 30 seconds to become visible through pointer caching; do not
   promise instant publication until an outbox/push design exists.
8. Unsupported blocks prevent a template switch by default. Lossy conversion is out of scope until
   retained recovery data and explicit confirmation are designed.
