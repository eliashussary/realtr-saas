import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// Ingested listings. Provider identity is tenant-local: sync conflict targets and lookups use
// `organizationId` + `source` + `sourceListingId`. `sourceKey` (DDF ListingKey) is the cross-tenant
// dedup identity and reconciliation key — preserved now so the future Technology-Provider model
// (one deduped canonical property + per-destination entitlement, ADR 0006) is additive, not a
// rewrite.
export const listing = pgTable(
  "listing",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // optional agent attribution within a brokerage
    memberId: text().references(() => member.id, { onDelete: "set null" }),
    source: text().notNull(), // provider tag, e.g. "ddf"
    sourceListingId: text().notNull(), // upstream business id (DDF ListingId)
    sourceKey: text().notNull(), // upstream resource key (DDF ListingKey) — dedup/reconcile identity
    status: text().notNull().default("active"), // active | removed
    sourceModifiedAt: timestamp(), // upstream ModificationTimestamp
    lastSeenAt: timestamp(), // last time this record was present in a sync
    // Tenant curation, owned by the realtor, not the feed. The sync upsert deliberately never writes
    // these, so they survive every re-sync (ADR 0006: feed columns and curation columns are distinct).
    featured: boolean().notNull().default(false),
    featuredRank: integer(), // order among featured listings; lower first, nulls last
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("listing_organization_source_source_listing_id_unique").on(
      t.organizationId,
      t.source,
      t.sourceListingId,
    ),
    index("listing_org_source_source_key_idx").on(t.organizationId, t.source, t.sourceKey),
  ],
)

// One incremental checkpoint + last-reconciliation marker per (org, provider). Can gain a
// `destinationId` dimension additively when the Technology-Provider feed lands (ADR 0006).
export const listingSyncState = pgTable(
  "listing_sync_state",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    checkpoint: text(), // ISO watermark for the next incremental delta
    lastReconciledAt: timestamp(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("listing_sync_state_org_provider_unique").on(t.organizationId, t.provider)],
)

// Diagnostics for each sync run (health, counts, errors). Never stores payloads/PII.
export const listingSyncRun = pgTable(
  "listing_sync_run",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    mode: text().notNull(), // incremental | reconcile
    status: text().notNull(), // succeeded | failed
    fetched: integer().notNull().default(0),
    upserted: integer().notNull().default(0),
    removed: integer().notNull().default(0),
    checkpoint: text(),
    error: text(),
    startedAt: timestamp().notNull(),
    finishedAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("listing_sync_run_org_provider_created_idx").on(
      t.organizationId,
      t.provider,
      t.createdAt,
    ),
  ],
)
