# Data handling: export, retention, and erasure

How Realtr handles tenant data for access and erasure requests (M7-A7). This is the engineering
reference for the behavior shipped in `@realtr/db/data-export`; the customer-facing privacy policy and
terms (which need legal review) live in `docs/legal/`.

## Data access / export

An organization **owner** can download a full JSON export from **Dashboard → Data & privacy**
(`exportMyOrgDataFn` → `exportOrganizationData`). The export contains:

- organization record; members (name, email, role); sites; **published** site revisions (live content);
  custom domains + status; integrations (kind/provider/status — **credentials redacted**); listings;
  leads; agent profiles; asset metadata (id/url/type); subscription mirror (no Stripe secrets).

Excluded by design: encrypted third-party credentials (`integration.config`), draft working state, and
platform secrets. The export is generated on demand and streamed to the browser; nothing is persisted.

## Erasure / deletion

An organization **owner** can permanently delete the organization from the same page
(`deleteMyOrgFn` → `deleteOrganization`), confirming by typing the exact org name. Deleting the
`organization` row FK-cascades to every tenant-scoped table: members, invitations, sites (+ revisions,
document state, preview grants, audit events), domains, integrations, listings (+ sync run/state),
leads, agent profiles, assets, and the subscription mirror.

The action is recorded in `admin_audit_event` (which references the org `ON DELETE SET NULL`, so the
audit row survives the erasure) before the delete runs.

### Not covered by the DB cascade (operational follow-ups)

- **S3 asset objects** — the `asset` rows cascade, but the stored objects in the bucket are not deleted
  by the DB. Until a storage-cleanup job exists, purge the tenant's asset prefix out of band on an
  erasure request. (The bucket is private, so this is a cost/retention item, not an exposure.)
- **Stripe subscription** — cancel any live subscription (Customer Portal / Stripe) before erasure;
  deleting the local mirror does not cancel billing at Stripe.
- **Backups** — erasure applies to the live database; data in retained backups ages out per the backup
  retention policy (M7-A4 runbook).

## Retention

Realtr retains tenant data for the life of the subscription. A lapsed/canceled subscription keeps data
intact for reactivation (ADR 0008); erasure is the explicit owner action above. Leads and listings are
retained until erasure or tenant-initiated removal.
