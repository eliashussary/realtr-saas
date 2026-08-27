# REALTOR.ca DDF discovery brief

Date: 2026-08-27  
Status: discovery evidence; not legal advice or launch approval  
Owner: Realtr product/engineering  
Primary intended participant: a solo Canadian REALTOR® using Realtr as the Technology Provider for
a Member Website Feed, with a possible National Shared Pool feed later

## Executive summary

REALTOR.ca DDF® is viable in principle for Realtr's product, but production canonical-model and
client work is **not ready to start beyond provider-neutral scaffolding and synthetic fixtures**.
Public official sources confirm a current RESO/OData Web API, OAuth 2.0 client-credentials
authentication, per-destination entitlements, paginated initial loads, modification-timestamp
replication, and daily master-list reconciliation. They also confirm strong display and operational
obligations: refresh at least every 24 hours, promptly remove records absent from the master list,
preserve supplied image watermarks, show attribution and brokerage identity, report listing
activity to CREA, deter scraping, and destroy local copies when participation ends.

The intended operating model is contract-dependent. The public rules define a Technology Provider
as a company with a CREA data-access agreement and expressly say a participant must not disclose
their DDF username/password to a Technology Provider. The API documentation separately describes
Technology Provider credentials, linked destinations, a unified dataset, and per-destination master
lists. Therefore Realtr should pursue Technology Provider onboarding rather than asking customers
to paste personal feed credentials. CREA must confirm that interpretation, the application and
approval path, permitted hosting/cache/media behavior, per-tenant custom-domain treatment, and
production credential provisioning in a signed agreement or written guidance.

No DDF agreement, credentials, gated help documentation, sandbox access, or earlier single-tenant
implementation was present in the repository. No live request was made and no production data was
acquired.

## Evidence labels

- **Confirmed**: stated by a current public official CREA/REALTOR.ca source listed below.
- **Contract-dependent**: must be confirmed by Realtr's executed agreement or written CREA advice.
- **Inference**: engineering consequence derived from confirmed facts; not represented as a CREA
  requirement.
- **Unknown**: no directly supporting public official source was found during this review.

All web sources were accessed 2026-08-27. The public rules PDF says “Revised: January 2024”; it is
the rules document linked from CREA's current DDF product page at the time of review. Currentness
must still be reconfirmed during onboarding because the rules allow later policies and board rules.

## Discovery-gate matrix

| Gate item | Status | Finding and primary evidence | Engineering/product consequence |
|---|---|---|---|
| Participant eligibility | Confirmed, with contract dependency | Brokerages may opt into DDF channels. Salespeople may participate only with brokerage permission. A Technology Provider is a company under a CREA data-access agreement. [Rules, §§3–4 and definitions](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) | Onboarding must establish member/brokerage authority and feed type. Realtr needs its own Technology Provider relationship before production operation. |
| Onboarding path | Partly confirmed | Members begin in the DDF Dashboard through the CREA Member Portal. [CREA product page](https://www.crea.ca/technology/realtor-ca-for-realtors/realtor-ca-tools/realtor-ca-ddf/) The public Technology Provider application, diligence, fees, lead time, and approval steps are unknown. | Block production connection UX and launch dates pending CREA onboarding guidance and agreement. |
| Credentials | Partly confirmed | Web API tokens use client credentials. [API authorization](https://ddfapi-docs.realtor.ca/) The rules prohibit participants from sharing their DDF usernames/passwords with a Technology Provider; API docs describe separate Technology Provider credentials and linked destinations. [Rules, §5(j)](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) | Do not design “paste your DDF password” onboarding. Confirm provider-level credential and destination-linking workflow. Encrypt all credentials server-side once issued. |
| Environments | Unknown | [Public API docs](https://ddfapi-docs.realtor.ca/) identify production hosts but no sandbox, test tenant, certification endpoint, or test credentials. | Block network contract tests and launch verification pending non-production access or CREA-approved test procedure. |
| API/feed protocol | Confirmed | RESO Web API over OData; JSON responses except XML metadata; HTTPS with TLS 1.2 minimum; OAuth 2.0 bearer tokens. [API docs](https://ddfapi-docs.realtor.ca/) Legacy RETS availability/current support was not confirmed. | Build only against the Web API unless CREA contractually requires another protocol. Remove the stub's “RETS/OData” ambiguity after approval. |
| Pagination | Confirmed | Default page is 20, `$top` maximum 100, `@odata.nextLink` signals continuation. Ordering is not guaranteed and pages may duplicate records; sort explicitly. More than 10,000 listings requires replication. [API pagination](https://ddfapi-docs.realtor.ca/) | Client must follow server next links, request deterministic supported ordering, deduplicate by resource key, and checkpoint only completed pages/runs. |
| Delta/update behavior | Confirmed, details partly unknown | Replication resources expose keys and `ModificationTimestamp`; filtered replication retrieves records changed since a timestamp. Daily unfiltered master lists are required for reconciliation. [API clients guide](https://ddfapi-docs.realtor.ca/) Cursor boundary semantics and timestamp precision guarantees are unknown. | Use an overlap window plus idempotent upserts until boundary semantics are confirmed. Store upstream timestamps and run checkpoints separately. |
| Delete semantics | Confirmed | Inactive, sold, cancelled, or no-longer-authorized records disappear from the master list and must be removed from the client store. [API clients guide](https://ddfapi-docs.realtor.ca/) Access termination requires destruction of all local DDF copies. [Rules, §8(e)](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) No public tombstone stream is documented. | Reconcile each destination against a daily complete master list. Model feed membership separately from the shared property so one destination removal does not erase another tenant's entitlement. Add hard purge for disconnect/termination. |
| Identifiers | Partly confirmed | `ListingKey` is the Property resource key; `ListingId` also exists. Technology Providers use `DestinationId` for per-client entitlement lists. Office and Member have their own keys. [API resources and TP guide](https://ddfapi-docs.realtor.ca/) Global stability, reuse, board scope, and cross-feed semantics are undocumented publicly. | Preserve `ListingKey`, `ListingId`, source, destination membership, and source timestamps. Do not finalize database uniqueness until CREA confirms key stability and scope. |
| Media handling | Partly confirmed | Property, Member, and Office payloads contain Media objects with URL, media key, order, preferred-photo flag, category, and modification timestamp. [API models](https://ddfapi-docs.realtor.ca/) Supplied image watermarks must display. [Rules, §6(a)](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) Public rules do not settle downloading, derivative generation, CDN proxying, cache TTL, URL lifetime, or purge timing. | Initially favor source URLs and preserve order/watermarks. Block image proxy/cache architecture until written permission. Never crop or overlay supplied watermarks. |
| Rate limits | Unknown | No numeric quota, concurrency limit, retry header contract, or token-endpoint limit appears in the [public API docs](https://ddfapi-docs.realtor.ca/). | Client concurrency, schedule, and backoff defaults remain provisional; request limits in writing and instrument 429/5xx responses. |
| Refresh frequency | Confirmed | Member and National Pool websites must refresh at least every 24 hours. [Rules, §5(b)](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) The API guide calls for daily master-list reconciliation. [API clients guide](https://ddfapi-docs.realtor.ca/) | Schedule incremental syncs more often than daily and a complete entitlement reconciliation daily, with a freshness SLO comfortably below 24 hours. Fail closed or hide stale content before breaching the confirmed maximum, subject to CREA guidance. |
| Uptime/support | Partly confirmed | Public support contact and hours are published. [CREA product page](https://www.crea.ca/technology/realtor-ca-for-realtors/realtor-ca-tools/realtor-ca-ddf/) No API SLA, maintenance window, incident feed, escalation severity, or uptime commitment was found publicly. | Define Realtr alerts and customer messaging without assuming an upstream SLA; request operations documentation. |
| Test/sandbox | Unknown | [API testing guide](https://ddfapi-docs.realtor.ca/) recommends Postman with a valid access token, but does not identify a sandbox or synthetic official dataset. | Use hand-authored synthetic fixtures now. Acquire approved sanitized captures only after test/production access and written permission. |
| Storage/caching | Partly confirmed, contract-dependent | The [API replication guide](https://ddfapi-docs.realtor.ca/) contemplates a separate database, while rules restrict use to permitted website/mobile display and require destruction after termination. [Rules, §§5 and 8(e)](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) Exact retention, backup, cache, derived-index, analytics, and cross-region terms are not public. | Store only fields needed for display/sync diagnostics; tenant-scope entitlement; make backups/purges auditable. Block final retention and backup policies pending agreement. |
| Display and attribution | Confirmed, some details contract-dependent | Each listing needs a linked “Powered by REALTOR.ca” logo, listing brokerage name, legally required information, and supplied watermarks. Every page needs trademark text plus controlling participant and brokerage identity. National Pool sites additionally need click-wrap or enhanced browse-wrap terms. [Rules, §6](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) | Attribution is a renderer invariant, not optional template content. Feed type must drive terms UX. Obtain current brand assets/text and provincial review before launch. |
| Filtering | Confirmed for National Pool | Only objective filters are allowed: geography/location, list price, rentals, property type, and property features; each participant chooses independently. [Rules, §7](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) | Do not expose arbitrary National Pool filters, editorial suppression, ranking inputs, reviews, or discriminatory filtering without compliance review. Member Feed applicability should be confirmed. |
| Custom/downstream websites | Partly confirmed | DDF content may appear only on the participant's approved Member or National Pool Website; a participant may operate no more than ten websites using DDF data. The definition of Website includes mobile apps. [Rules, definitions and §5](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) | Do not assume platform subdomain plus vanity alias is one website, or that a wildcard multi-tenant renderer is approved. Register/associate every served hostname as CREA directs and prevent cross-site reuse. |
| Privacy | Confirmed at high level, details unknown | CREA notes listing information can include personal information and is governed by applicable board privacy policy and listing agreement. [CREA privacy notice](https://www.crea.ca/privacy/buyers-and-sellers/) Member/contact fields can contain personal information. [API Member model](https://ddfapi-docs.realtor.ca/) | Data minimization, access controls, purpose limitation, retention/purge, vendor/subprocessor, residency, and privacy notices need legal/privacy review before ingest. Do not log raw payloads. |
| Launch approval/compliance | Partly confirmed | Sites must be directly accessible to boards/CREA for monitoring. CREA/boards may require remediation, suspend access, or terminate it. [Rules, §8](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf) No public pre-launch certification sequence was found. | Require a compliance acceptance checklist and written answer on pre-production review/approval. Provide an accessible review hostname and rapid takedown/remediation runbook. |

## Participant and operating model

### Confirmed facts

The DDF is permission-based. Its relevant inbound channels are:

- **Member Website Feed**: a salesperson's own listings or all listings of their participating
  brokerage for display on their own Member Website.
- **National Shared Pool**: participating members contribute their eligible listings and receive
  other participants' eligible listings for display on a National Pool Website.

Brokerages control their own participation and permissions for salespeople. A salesperson cannot
participate if their brokerage has not at least opted in to permit salesperson participation.
Members use the DDF Dashboard on CREA's Member Portal. The public CREA product page offers a
“Get started” link to that authenticated portal and Member Experience Centre support.

The rules permit a participant to use a Technology Provider, but the participant remains
responsible for that provider's conduct. The provider definition requires a CREA data-access
agreement. Participants must opt into the relevant feed before retaining the provider and must not
share DDF credentials with it.

### Recommended Realtr model (inference)

Realtr should apply as a Technology Provider and use provider credentials plus CREA's destination
linking workflow. Each Realtr organization/site must retain its own `DestinationId`, participant
identity, feed type, approved hostnames, and entitlement set even if CREA returns a provider-wide
unified property payload. This prevents a listing available to tenant A from being exposed to
tenant B merely because both are available to Realtr upstream.

Customer onboarding should be an authorization/linking workflow, not credential collection, unless
CREA explicitly supplies a different approved method. A connection cannot become “servable” until
the participant, brokerage permission, feed/destination, sites/domains, and compliance review state
are known.

## Technical protocol and synchronization

### Authentication and transport

- Token endpoint: `https://identity.crea.ca/connect/token`.
- Grant: OAuth 2.0 `client_credentials`; scope `DDFApi_Read`.
- API credentials map to client ID and secret. Tokens default to 3,600 seconds and are not sliding.
- API requests carry a bearer token and require HTTPS; documented minimum TLS is 1.2.
- Production API base shown publicly: `https://ddfapi.realtor.ca/odata/v1/`.
- Responses are JSON except `$metadata`, which is XML.

Tokens and secrets must remain server-side, encrypted at rest, redacted from errors, and decrypted
only immediately before use. The existing `SourceContext.config` can eventually carry an opaque
credential reference/config, but a raw browser-supplied password would conflict with the public
Technology Provider rule.

### Resources and identifiers

The public API documents Property, Member, Office, OpenHouse, Destination, and replication
resources. Property detail includes nested Rooms and Media. Relevant identifiers include
`ListingKey`, `ListingId`, `MemberKey`, `OfficeKey`, `OpenHouseKey`, and `DestinationId`.

`ListingKey` is the best currently documented upstream resource key, but an ADR must not yet assert
that it is globally immutable or never reused. Preserve all upstream identity components needed to
re-evaluate that choice, including the destination membership and any board/association fields
present in approved fixtures/metadata.

### Initial load and pagination

The initial load requests active Property details. Collection responses default to 20 records and
allow at most 100 via `$top`; a returned `@odata.nextLink` is the continuation authority. The docs
warn that result order is not guaranteed and multiple pages may repeat a record, so clients must
request a supported stable order and still deduplicate. Collection pagination above 10,000 records
must use replication.

### Incremental changes and removal

Property/Member/Office replication returns resource key plus `ModificationTimestamp`, optionally
filtered to changes since a time. Fetch details for changed keys. A daily unfiltered destination
master list gives the complete current entitlement set. Records missing from that set must be
removed; the docs specifically include sold, cancelled, and no-longer-approved listings. For a
Technology Provider, a provider-wide feed reduces duplicate property transfer, but each
destination's master list is still required to determine what that customer may display.

A safe inferred algorithm is:

1. Authenticate as the approved Technology Provider and enumerate linked destinations.
2. For each destination, obtain its complete master list at least daily and stage it under that
   organization/destination.
3. Fetch provider-wide changes since a conservative overlapping watermark; paginate via next links
   and deduplicate by resource key.
4. Fetch and normalize changed details, retaining raw diagnostics only under an approved retention
   policy.
5. Transactionally upsert canonical property data and per-destination entitlement/membership.
6. Remove public entitlement absent from the successful complete master list. Never treat a partial
   or failed list as authoritative.
7. Advance the checkpoint only after the run is durable; record counts, freshness, errors, and
   upstream response status without payload/PII.
8. On disconnect, suspension, or termination, immediately stop serving and execute the confirmed
   destruction/purge workflow, including caches and backups as the agreement requires.

Timestamp inclusivity, clock skew, maximum `in (...)` batch, supported `$orderby`, next-link expiry,
and failure recovery are unanswered. Until confirmed, overlap time windows and make all writes
idempotent.

### Availability, limits, and monitoring

No public numeric rate limit or SLA was found. Implement exponential backoff with jitter for
retryable 408/429/5xx/network errors only after CREA confirms retry semantics, honor any retry
headers, cap attempts, and prevent concurrent syncs per credential/destination. Monitor:

- last successful delta and complete master-list reconciliation per destination;
- oldest publicly served upstream modification and entitlement verification times;
- token failures, 403/suspension, 429, timeouts, 5xx, pagination loops, duplicates, and schema drift;
- fetched/updated/removed/entitled counts with anomaly thresholds;
- media failures, attribution/render checks, analytics-event delivery, and suspected scraping;
- purge completion after disconnect/termination.

Public support: CREA Member Experience Centre, `support@crea.ca`, 1-888-237-7945; the current
product page publishes hours. Ask for the Technology Provider operational/escalation channel rather
than assuming member support is the production incident path.

## Data, media, display, and compliance

### Storage and purpose

The Web API guide explicitly describes replication into a provider's separate database, so local
operational storage is contemplated. The rules restrict received content to the permitted display
and own-listing marketing purposes, prohibit disclosure/reuse outside those purposes, and require
destruction after access ends. These public facts do not define cache TTL, backup retention,
derived search indexes, hosting region, subprocessors, or use of data for product analytics or AI.
Those uses require written contractual/privacy confirmation.

Canonical normalized fields must remain faithful to source content. The rules prohibit modifying
other participants' listing content; separately sourced augmentation is permitted only when it does
not interfere with or alter DDF content. Preserve provenance so DDF and non-DDF data are visibly
and operationally separable.

### Media

Media objects expose URL, key, modification timestamp, order, preferred-photo flag, category, and
descriptive fields. CREA-provided watermarks must remain displayed. The API release notes dated
2026-05-07 warn that MediaKey behavior is changing so unrelated property changes no longer change
all photo keys; clients are directed to Media `ModificationTimestamp` to detect photo changes.
Therefore media identity should not depend on MediaKey alone, and the exact post-change behavior
must be fixture-tested.

Do not download, transform, crop, strip, overlay, or permanently cache media until CREA confirms
the allowed treatment. A source-URL implementation is the least assumptive starting point, but URL
hotlinking, expiry, referrer policy, and image optimization also require confirmation.

### Renderer invariants

For every DDF listing display, templates must preserve:

- a current approved “Powered by REALTOR.ca” badge linked directly to that listing on REALTOR.ca;
- prominently readable listing brokerage name and province-required disclosure;
- all supplied watermarks;
- participant/brokerage identity and required MLS®/REALTOR® trademark statement on every site page;
- National Pool terms acceptance through compliant click-wrap or enhanced browse-wrap;
- no advertising or co-branding on National Pool listing content;
- no listing comments/reviews or links to them on National Pool sites;
- only allowed objective National Pool filters;
- analytics activity reporting required by CREA;
- reasonable anti-scraping monitoring and blocking.

The public API documentation's example badge snippets differ from the January 2024 rules' stated
minimum 90-pixel width and 1:1 ratio (the example asset is shown at width 125 without an explicit
height). Obtain the current approved asset and brand specification; do not resolve this discrepancy
by guessing.

### Websites, domains, and multi-tenancy

The rules limit a participant to ten websites using received DDF content and permit content only on
their Member/National Pool Websites. It is unknown whether CREA treats a Realtr platform hostname
and its vanity-domain alias as one website, two websites, or requires both to be separately listed;
it is also unknown how preview/staging hosts are treated. Realtr must not serve DDF content on an
unapproved fallback host. Host-to-site resolution, destination entitlement, and organization must
all agree before rendering.

Technology Provider unified access is a transport optimization, never an authorization shortcut.
Cache keys must include the destination/organization and servable hostname. A provider-wide
canonical property may be shared internally only if the agreement permits it; public entitlement
must always be destination-specific.

### Privacy

CREA's privacy notice says property listing information can include personal information and is
also governed by the applicable board privacy policy and listing agreement. Member and Office
resources expose contact and affiliation data. Before launch, Realtr's privacy lead/counsel must
approve data minimization, purposes, regional hosting, subprocessors, breach handling, access and
deletion processes, and customer-facing notices. Avoid ingesting Member/Office fields that the
renderer does not need. Never log raw payloads, addresses tied to non-public records, member contact
details, tokens, or destination identifiers unnecessarily.

## Implications for Realtr's current repository

### Existing seams

- `packages/core/src/integrations/sources/ddf.ts` is a no-op and still says “RETS/OData.” Current
  public evidence supports RESO Web API/OData; legacy RETS should not be implemented absent a
  contract requirement.
- `ListingSource.pull(): Promise<NormalizedListing[]>` cannot express pagination checkpoints,
  per-destination entitlement, removals, partial failures, or run diagnostics. It will need a
  versioned streaming/page or sync-plan contract after access questions close.
- `NormalizedListing` has only `sourceListingId` and opaque data. The future contract needs source
  key(s), source timestamps, provenance, status, media metadata, and entitlement context.
- The current listing uniqueness is `(source, sourceListingId)` even though rows are tenant-owned.
  That permits upstream collisions across organizations and conflicts with tenant isolation. The
  separately owned M0-E1 packet addresses this immediate defect; DDF discovery does not edit it.
- `integration.config` can store encrypted configuration but cannot by itself model a provider
  account linked to many destination feeds, feed type, approved hosts, consent state, or sync
  checkpoints. Final placement awaits the Technology Provider contract and canonical ADR.

### Canonical model decisions

| Decision | Readiness | Required direction/evidence |
|---|---|---|
| Tenant-aware listing uniqueness | Unblocked provider-neutral requirement | Every organization-owned listing/entitlement key must include organization scope. M0-E1 can proceed independently. |
| Upstream canonical property key | Blocked | Confirm `ListingKey` stability, global scope, reuse, and behavior across boards/feed types. |
| Shared property vs tenant copy | Blocked | Confirm whether Technology Provider agreement permits a provider-wide stored canonical record and what purge means when only one destination loses access. Default safely to tenant-separated content. |
| Destination entitlement model | Direction unblocked; exact schema blocked | Must represent many destination memberships independently of property content. Validate destination lifecycle and identifiers with real metadata/fixtures. |
| Status/deletion | Direction unblocked | Public serving must depend on current master-list membership; missing means remove. Decide hard-delete vs quarantined diagnostics only after retention terms. |
| Field mapping | Blocked | Acquire authenticated `$metadata` and approved fixtures across representative boards/property types; fields and geocodes can vary. |
| Media model | Blocked | Preserve source metadata and watermarks; confirm URL/cache/derivative rights and MediaKey rollout behavior. |
| Sync scheduling | Partly unblocked | Daily full master list is mandatory; use more frequent deltas. Exact concurrency/rate/backoff awaits limits and SLA. |
| Public rendering | Partly unblocked | Attribution and participant identity are cross-template invariants. Exact assets, provincial disclosures, domain approval, terms flow, and analytics integration remain blocked. |
| Raw diagnostics/retention | Blocked | Agreement/privacy review must define allowed fields, encryption, backup retention, purge, and support access. |

A canonical-model ADR is deliberately **not proposed yet**. The questions above affect core
identity, tenancy, storage, and deletion semantics; publishing an ADR now would merely encode
assumptions. Draft it after written CREA answers and representative metadata/fixtures are available.

## Sanitized fixture acquisition plan

This plan is safe and usable now with synthetic fixtures, and reproducible later with approved
captures. It does not require or permit committing credentials or restricted production data.

1. **Obtain authorization first.** Get written CREA approval to retain sanitized Web API responses
   in a private source repository for automated contract tests, including metadata and media URL
   treatment. Prefer an official sandbox/test destination. Record the agreement/document version,
   not secrets, in this brief.
2. **Create synthetic fixtures now.** Hand-author minimal JSON from the public schema/examples under
   a future provider test directory. Mark every file `synthetic`, use impossible/non-real addresses,
   `.invalid` contacts/URLs, non-production destination IDs, and generated keys. Cover an initial
   page, `@odata.nextLink`, duplicate across pages, delta list, full master list, removal, media
   reorder/change, nullable geocode, token/error responses, and two destinations with overlapping
   property access. Do not copy CREA images or trademarks into fixtures; use a test placeholder.
3. **Capture only through an approved test account.** Run a local redaction tool against sandbox or
   CREA-approved records. Never print authorization headers or token bodies. Capture response body,
   status, safe headers, request shape without credentials, and the authenticated `$metadata`
   version/hash.
4. **Deterministically sanitize.** Replace names, emails, phones, street/unit/postal address,
   remarks, URLs, media bytes/URLs, member/office IDs, listing IDs/keys, destination IDs, coordinates,
   virtual-tour links, timestamps where identifying, and any board-specific private values. Maintain
   referential relationships with seeded keyed pseudonyms. Strip unknown fields by default pending
   review. Never retain original and sanitized payloads together in the repository.
5. **Validate leakage.** Schema-validate the sanitized output, scan for tokens/JWTs, emails, phones,
   Canadian postal codes, real hosts, GPS coordinates, and unapproved binary/base64 data. A second
   reviewer compares only in a secure ephemeral workspace; destroy the raw capture immediately
   afterward according to the agreement.
6. **Record provenance without restricted data.** Each fixture manifest states API version,
   metadata hash, capture month, feed type, scenario, sanitizer version, synthetic/sanitized status,
   and reviewer approval. It contains no participant, destination, listing, member, or office IDs.
7. **Test offline.** Contract tests must have network disabled and cover token redaction, pagination,
   deduplication, timestamp overlap, per-destination entitlement, transactional failure, absent-key
   removal, schema drift, nullable/unknown enums, media changes, and cross-tenant denial.

Production-derived sanitized fixtures remain blocked until CREA explicitly permits this. Public API
examples may inform hand-authored synthetic shapes, but they are not evidence of real data
variability.

## Exact questions and access needed next

### CREA DDF / Technology Provider team

Contact the Member Experience Centre (`support@crea.ca`, 1-888-237-7945) and ask to route these to
the DDF Technology Provider onboarding, legal/compliance, and API operations owners:

1. What is the current Technology Provider application, agreement, fee schedule, eligibility,
   security review, expected lead time, and production approval/certification process for a SaaS
   hosting separate Member Websites for Canadian REALTORS®?
2. Confirm that Realtr must use Technology Provider credentials and linked destinations, and that
   customers must never provide their destination username/password to Realtr. How does a customer
   authorize/link/revoke a destination?
3. Is there a sandbox/test provider account, synthetic dataset, test destination, staging identity
   host, certification suite, Postman collection, or OpenAPI artifact? May sanitized responses and
   `$metadata` be committed privately for offline tests?
4. Are `ListingKey`, `MemberKey`, and `OfficeKey` globally unique, immutable, and never reused? Can
   the same property/listing have different keys across destinations or boards? What is the role and
   scope of `ListingId`?
5. Specify replication timestamp precision, timezone, inclusive/exclusive `$filter` behavior,
   clock-skew guidance, late arrivals, supported ordering, next-link validity, maximum `in` batch,
   and expected handling when detail disappears after a replication result.
6. Confirm that absence from a successfully completed destination master list is the sole deletion/
   de-authorization signal. How quickly must it be removed? Are tombstones or webhooks available?
7. What rate/concurrency/token limits apply per Technology Provider, credential, destination, and IP?
   Which status codes are retryable, are `Retry-After` headers sent, and what backoff is required?
8. Provide uptime/SLA, maintenance, incident/status feed, deprecation/versioning policy, schema-change
   notice, escalation contacts, and recovery expectations.
9. May Realtr store normalized/raw records, search indexes, thumbnails, source media, and CDN/cache
   copies? State allowed regions/subprocessors, encryption expectations, TTLs, backup retention,
   derived-data restrictions, and required purge scope/timing after feed removal or termination.
10. Must media be hotlinked or downloaded? Are resizing, format conversion, responsive variants,
    optimization, cropping, lazy loading, and caching permitted? How long are URLs valid? Provide the
    current watermark and MediaKey/ModificationTimestamp rules.
11. Provide the current Analytics Web Service API specification, credentials, event definitions,
    delivery/retry rules, privacy/consent requirements, testing path, and launch validation.
12. Provide current approved Powered by REALTOR.ca assets, link construction, trademark statements,
    French requirements, accessibility requirements, and rules governing card/list/detail/search/
    structured-data displays.
13. Does the ten-Website limit apply per participant, feed, destination, hostname, or distinct site?
    Is a platform subdomain plus vanity alias one Website? Are preview/staging hosts allowed, and
    must every hostname be registered or reviewed?
14. Can one multi-tenant renderer host many participants if host resolution strictly separates each
    destination? May provider-wide canonical payloads be stored once, or must content be physically
    separated per destination/customer?
15. What constitutes “online brokerage services,” prohibited co-branding/advertising, and reasonable
    anti-scraping protection for a lead-capture realtor website? Are SEO indexing and JSON-LD allowed,
    and which search engines are currently recognized?
16. Which current policies supplement the January 2024 public rules, and which board-specific rules
    must Realtr/each participant obtain? Is a pre-launch site review mandatory, and who signs off?

### Pilot REALTOR® and brokerage owner

Obtain a willing pilot participant and brokerage decision-maker who can:

- confirm active CREA/board membership and brokerage permission;
- choose Member Website Feed (own vs all-office listings) or National Shared Pool;
- create/authorize the destination in the DDF Dashboard without sharing credentials;
- identify every proposed production, vanity, preview, and staging hostname;
- supply applicable brokerage branding and province/board disclosures;
- authorize CREA/board compliance review and removal testing.

### Legal/privacy/compliance approval

Realtr's Canadian counsel/privacy lead and the pilot brokerage compliance officer must approve:

- the executed Technology Provider agreement and current DDF/board rules;
- product classification (Member Website vs National Pool) and prohibited online-brokerage boundary;
- display text, terms acceptance, trademarks, brokerage identity, advertising/co-branding, filters,
  lead capture, SEO/structured data, and bilingual/provincial obligations;
- personal-information purposes, data minimization, subprocessors/residency, retention, backups,
  incident response, customer privacy notices, and destruction verification;
- domain/site counting and launch/review evidence.

## Decision checklist

- [ ] Realtr Technology Provider eligibility and agreement approved by CREA/business/legal.
- [ ] Pilot brokerage and salesperson permissions confirmed; intended feed type documented.
- [ ] Provider credential and destination linking/revocation flow confirmed.
- [ ] Sandbox or approved fixture capture route available.
- [ ] Authenticated `$metadata`, API version, and representative feed fixtures reviewed.
- [ ] Identifier scope/reuse and destination membership semantics confirmed.
- [ ] Pagination, delta boundary, master-list deletion, and error/retry semantics confirmed.
- [ ] Rate limits, SLA, status/deprecation channels, and operational escalation documented.
- [ ] Storage, caching, media transformation, backups, retention, and purge rights approved.
- [ ] Analytics Web Service API requirements and test evidence available.
- [ ] Current attribution assets, trademark/disclaimer text, terms UX, filters, and anti-scraping
      controls approved.
- [ ] Platform/vanity/preview domains and ten-Website counting approved.
- [ ] Privacy, provincial, board, and launch-review sign-offs recorded.
- [ ] Sanitized offline fixtures pass leakage review and cover two destinations.
- [ ] Only then: draft canonical-model ADR and version the ListingSource contract/client plan.

## Product risks

1. **Operating-model risk (critical):** collecting member credentials instead of establishing an
   approved Technology Provider link could violate the public rule and prevent launch.
2. **Cross-tenant disclosure (critical):** a unified provider feed without per-destination master-list
   enforcement could display listings to an unauthorized customer.
3. **Deletion/purge risk (critical):** incremental changes alone do not reveal all removals; failed
   daily reconciliation or incomplete cache purge can leave prohibited content public.
4. **Domain/product-shape risk (high):** platform aliases, vanity domains, previews, multi-site
   tenants, and the ten-Website limit need written interpretation.
5. **Media/compliance risk (high):** standard image optimization could violate watermark, caching,
   or derivative restrictions that are not public.
6. **Launch-scope risk (high):** National Pool terms/filter/advertising restrictions are materially
   heavier than a Member Website Feed. MVP should prefer the narrowest approved Member Website Feed.
7. **Schema/reliability risk (high):** undocumented key and delta-boundary semantics can cause
   collisions, missed updates, or mistaken deletions.
8. **Privacy risk (high):** broad Member/Office/raw-payload ingestion would collect personal data
   beyond the renderer's needs.

## Recommendation

Proceed now only with provider-neutral tenant-aware identity fixes, sync-run abstractions that do not
assert DDF semantics, and hand-authored synthetic offline test scenarios. Do **not** implement the
production DDF client, final canonical listing schema, customer credential UI, media pipeline, or
public DDF rendering yet.

The fastest credible launch path is: secure Realtr's Technology Provider onboarding; select one
pilot solo REALTOR® and brokerage; use the Member Website Feed rather than National Shared Pool;
obtain sandbox/approved fixtures and current metadata; close the identity, destination, rate,
storage/media, analytics, domain, and approval questions in writing; then write the canonical-model
ADR and implement against those artifacts.

## Official sources

All accessed 2026-08-27.

1. [CREA — REALTOR.ca DDF® product page](https://www.crea.ca/technology/realtor-ca-for-realtors/realtor-ca-tools/realtor-ca-ddf/)
   — intended users, feed/channel overview, authenticated “Get started” path, current resource links,
   and Member Experience Centre contact/hours.
2. [CREA — DDF® Policy and Rules, revised January 2024](https://www.crea.ca/files/technology/english/DDFR-Policy-and-Rules-February-2024-ENG.pdf)
   — participation, Technology Provider definition/credential restriction, allowed use, refresh and
   deletion, website limits, display/terms/filtering, scraping, enforcement, and destruction. This is
   the public rules document linked through CREA's current DDF page; later/gated policies may apply.
3. [REALTOR.ca DDF® Web API documentation 1.0](https://ddfapi-docs.realtor.ca/)
   — OAuth, production API, resources, JSON/XML formats, OData pagination, replication/master-list
   workflow, Technology Provider unified feed/destination workflow, media shapes, and TLS minimum.
4. [REALTOR.ca DDF® Web API release notes](https://ddfapi-docs.realtor.ca/releasenotes)
   — current platform change history, including 2026 MediaKey/ModificationTimestamp behavior and
   field/filterability changes.
5. [REALTOR.ca Canada Inc. — Buyers and Sellers privacy notice](https://www.crea.ca/privacy/buyers-and-sellers/)
   — listing information flow to DDF and the fact that some listing fields can be personal
   information governed by board privacy policy/listing agreement.
6. [CREA Support portal — DDF support](https://support.crea.ca/)
   — official DDF support purpose and access point; detailed resources may require REALTOR.ca SSO.

## Source limitations and unknown documents

- No private Technology Provider agreement, DDF credentials, participant/destination IDs, board
  rules, authenticated `$metadata`, Analytics Web Service API specification, or gated help guide was
  available in the repository or used in this review.
- No public official source was found for numeric rate limits, sandbox availability, uptime/SLA,
  credential-linking UI details, fees/timing, cache/media rights, custom-domain counting, or exact
  launch certification. Those items remain unknown, not negative findings.
- The API reference contains sample localhost URLs and generated example values. They demonstrate
  shapes, not production behavior or contractual permission.
- National DDF rules do not replace provincial law, board/association rules, listing agreements, or
  Realtr-specific contract review.
