# ADR 0006: DDF credential model for MVP — tenant-supplied Web API keys

- Status: Accepted
- Date: 2026-08-28
- Decision owners: product owner
- Supersedes (for MVP): the Technology-Provider inference in the M3-D1 discovery brief
  (`docs/research/2026-08-27-realtor-ca-ddf-discovery.md`)

## Context

The M3-D1 discovery brief inferred, from public rules, that Realtr should onboard as a CREA
**Technology Provider** with destination-linking, and warned against "paste your DDF password"
onboarding because DDF rules §5(j) prohibit a participant sharing their **DDF portal
username/password** with a Technology Provider. It marked much of the canonical model, credentials,
environments, and fixtures as blocked pending that onboarding.

The product owner has clarified the operating reality for MVP: an individual REALTOR® can, today,
log into the CREA Member Portal and **self-provision their own DDF Web API key** (an OAuth2
`client_id`/`client_secret`) for their **own Member Website Feed**. Connecting that
self-generated API key to the software running the realtor's own site is *tenant-supplied API
credentials* — not portal-password sharing, and not contingent on Realtr being a Technology
Provider.

## Decision

For MVP, Realtr connects DDF using **credentials the tenant generates themselves** and enters into
Realtr, for their own Member Website Feed. Realtr does **not** pursue Technology-Provider onboarding
or destination-linking for MVP.

Consequences for M3:

- **Onboarding is a connect-your-key flow** (enter + test issued API credentials), stored encrypted.
  This matches the already-built DDF source config `{ clientId, clientSecret }` and `verify()` — no
  rework. The §5(j) password-sharing prohibition is respected because no portal password is handled.
- **No destination-entitlement model for MVP.** Each tenant authenticates with its own credentials;
  everything that credential returns *is* that tenant's feed. Reconciliation is per-credential (the
  full replication master list for that key), and listings stay tenant-owned. The
  provider-wide-unified-feed / per-`DestinationId` complexity is deferred with the TP model.
- **Real access is now obtainable for a pilot.** A pilot realtor's own key can supply authenticated
  `$metadata` and sanitized fixtures, so field mapping and the canonical-model work (M3-A7) are no
  longer hard-blocked — they proceed once a pilot key is available, still without committing live
  credentials or unsanitized payloads.

## What this does NOT change

These obligations are independent of the credential model and remain requirements before serving DDF
content publicly (see the brief for citations):

- attribution/display invariants ("Powered by REALTOR.ca" badge, brokerage name, MLS®/REALTOR®
  trademark text), preserved image watermarks;
- refresh at least every 24h and prompt removal of records absent from the master list;
- the participant's ≤10-websites limit and serving DDF content only on approved hostnames;
- privacy/data-minimization and destruction-on-disconnect.

Attribution/watermark handling stays a renderer invariant (M3-A6), not optional template content.

## North star: Technology Provider with a deduped feed (retained goal)

The tenant-supplied-key model is a **deliberate MVP stepping stone, not the destination.** The
intended end state remains Realtr as a CREA **Technology Provider** consuming a single provider-wide,
**deduplicated** feed, with per-destination entitlement deciding what each tenant may display — the
efficient model for scale and for the National Shared Pool. MVP must therefore be built so the move
to it is **additive, not a rewrite.** Seams every MVP slice must preserve:

- **`sourceKey` (DDF `ListingKey`) is the cross-tenant dedup identity.** Persist it on every listing
  now (distinct from the tenant-local `sourceListingId`), even though MVP keys rows per tenant. A
  later shared-property table keys on `(source, sourceKey)`; tenant rows become an entitlement join.
- **Entitlement is a concept, not just a byproduct.** In MVP a tenant's entitlement is "everything
  its own credential returns," but reconciliation is modeled as *membership in a current master
  list* — the same shape a per-`DestinationId` master list will take. Keep removal driven by
  master-list membership, not by per-tenant fetch alone.
- **The sync engine talks to a repository port, not raw tables.** Swapping the MVP tenant-copy
  repository for a shared-canonical + entitlement repository is an implementation change behind that
  port, not an engine rewrite. The engine stays agnostic to tenant-copy vs shared-canonical.
- **The credential/config model is provider-account-shaped.** Store credentials as an opaque config
  that can later carry a provider account linked to many destinations (feed type, approved hosts,
  `DestinationId`s) without changing the `ListingSource` contract.
- **Provenance stays explicit** so DDF vs non-DDF and per-source identity remain separable when the
  feed becomes shared.

Sync state/tables (`listing_sync_state`, `listing_sync_run`) are keyed `(org, provider)` in MVP and
must be able to gain a `destinationId` dimension additively.

## Follow-up

- Reframe M3-A7 from "blocked pending TP onboarding" to "proceed once a pilot API key yields real
  `$metadata` + sanitized fixtures."
- Keep a standing **M3-B (post-MVP) Technology-Provider track**: TP onboarding, provider-wide
  deduped feed, per-`DestinationId` entitlement, and National Shared Pool. This is planned work, not
  a maybe — the seams above exist to make it additive. Its own ADR designs the shared-canonical +
  entitlement schema when TP onboarding is underway.
