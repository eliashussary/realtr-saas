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

## Follow-up

- Reframe M3-A7 from "blocked pending TP onboarding" to "proceed once a pilot API key yields real
  `$metadata` + sanitized fixtures."
- Revisit the Technology-Provider model only if/when Realtr needs the National Shared Pool or
  provider-wide scale beyond individual Member Website Feeds (post-MVP).
