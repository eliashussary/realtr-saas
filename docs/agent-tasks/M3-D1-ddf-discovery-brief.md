# M3-D1 — REALTOR.ca DDF discovery brief

- Status: done
- Milestone: M3 — Listings and REALTOR.ca DDF
- Type: research and product/technical discovery; no production code

## Outcome

The repository contains an evidence-backed brief describing current DDF access, technical protocol,
data/display obligations, unknowns, and concrete implications for Realtr's listing model and launch.

## Why now

DDF is an external product/compliance dependency. Building a schema or client from assumptions risks
rework or a product that cannot legally or operationally launch.

## Required context

- README product objective
- M3 section of `docs/EXECUTION_PLAN.md`
- `packages/core/src/integrations/sources/**`
- `packages/db/src/schema/listing.ts` and `integration.ts`
- any user-provided DDF agreements, credentials documentation, or earlier single-tenant codebase;
  do not assume access if these are absent

## Dependencies

None. Internet or private-document access may require explicit authorization. Do not fabricate
answers when access is unavailable.

## Scope

- Research current official CREA/REALTOR.ca DDF participant eligibility and onboarding paths.
- Identify current feed/API protocols and environments available to the intended participant type.
- Document authentication, pagination/delta behavior, identifiers, update/delete semantics, media
  handling, rate limits, uptime/support expectations, and test/sandbox availability.
- Document permitted storage/caching, display rules, attribution/disclaimer requirements, refresh
  frequency, downstream/custom-domain constraints, privacy implications, and launch approval.
- Separate official facts, contract-dependent details, informed inferences, and unanswered questions.
- Produce a proposed sanitized fixture acquisition plan without including credentials or restricted
  production data.
- Map findings to implications for canonical listing identity, tenant attribution, sync scheduling,
  deletion, public rendering, and operational monitoring.
- Produce a decision checklist and the exact questions/contacts/documents needed to close gaps.

## Non-goals

- Implementing a DDF client or schema migration
- Treating third-party blog posts as authoritative contract terms
- Legal advice or asserting compliance without review
- Requesting or storing live credentials in the repository
- Choosing later listing providers

## Ownership

Create a dated brief under `docs/research/` and, if justified, a proposed canonical-model ADR that
remains explicitly blocked pending unanswered DDF facts. Avoid code, schema, manifest, and lockfile
changes.

## Constraints

- Prefer current official primary sources and cite each material claim with a direct link and access
  date. Mark gated/private documents clearly.
- Do not quote or reproduce restricted agreements beyond what repository access permits.
- Never include credentials, participant IDs, or unsanitized listing payloads.
- Distinguish national DDF behavior from board-specific MLS/IDX assumptions.

## Acceptance criteria

- The brief answers or explicitly marks unknown every discovery-gate item listed in M3.
- Every factual claim that can affect architecture or compliance cites a current primary source or
  named private agreement.
- Technical and contractual uncertainty is translated into concrete blocked/unblocked engineering
  decisions.
- The fixture plan is safe, reproducible, and usable for offline provider contract tests.
- The brief identifies who must approve remaining business/legal/compliance questions.

## Verification

Cross-check dates and version/current-status indicators on official sources. Verify every link opens
and directly supports its associated claim. Review the brief against M3's external discovery gate
line by line.

## Handoff

Follow the standard handoff adapted for research. Include an executive summary, confirmed facts,
unknowns, sources, product risks, engineering implications, exact access needed next, and a clear
recommendation on whether canonical-model/client work is ready to start.
