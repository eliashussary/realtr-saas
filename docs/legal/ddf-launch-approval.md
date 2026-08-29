# CREA DDF — launch approval checklist

Gates to clear before serving **real** REALTOR.ca listing data to the public (M7-A7). Tracks the CREA
DDF terms and the decisions in ADR 0006 (MVP tenant-supplied keys) and the north-star Technology
Provider model.

## Technical / compliance gates

- [ ] **Attribution** — every listing surface shows the REALTOR.ca "Powered by" mark and source-aware
      attribution. *(Built: source-aware attribution + official asset, M3-A8.)*
- [ ] **Permitted fields** — only DDF fields permitted for display are rendered; no disallowed fields
      are shown or exported. Review the current listing view against the DDF display rules.
- [ ] **Watermarks** — listing photos preserve provider watermarks (no stripping/altering).
      *(Built: watermarks preserved, M3.)*
- [ ] **Refresh cadence** — data refreshes at least every 24h; incremental + daily reconciliation are
      scheduled and observed succeeding in the ops console. *(Built: hourly incremental + daily
      reconcile, M3-A5.)*
- [ ] **Deletions honored** — listings absent from the master list are marked removed and stop serving
      within the refresh window. *(Built: reconciliation, M3.)*
- [ ] **Per-tenant credentials** — each tenant supplies their own DDF key; keys are encrypted at rest
      and never logged. *(Built: encrypted per-tenant config, ADR 0006.)*
- [ ] **Take-down path** — an operator can pause a tenant's sync and detach data promptly. *(Built:
      admin pause + per-tenant levers, M7-A1/A2.)*

## Business / legal gates (owner + counsel)

- [ ] DDF terms of use accepted; display/attribution obligations confirmed with CREA.
- [ ] Confirm the MVP tenant-supplied-key model is compliant for each participating board/tenant.
- [ ] Privacy policy + terms finalized by counsel (`privacy-policy.md`, `terms-of-service.md`).
- [ ] Canadian tax posture confirmed (ADR 0008: Stripe Tax plumbed, disabled below the CRA
      small-supplier threshold).

## North star (post-MVP, ADR 0006)

- [ ] Technology Provider onboarding with a single deduped canonical feed + per-`DestinationId`
      entitlement, replacing per-tenant keys. `sourceKey` (DDF ListingKey) is already preserved as the
      cross-tenant dedup identity so this is additive.
