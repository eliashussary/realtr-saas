import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { member, organization, user } from "./auth"

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
})

// A tenant (organization) has many sites: solo realtor = 1; brokerage = brand site + agent sites.
// `theme`/`pages` are loosely typed jsonb here (the DB layer stays a leaf); the render layer
// (@realtr/ui ThemeTokens, @realtr/site Puck data) narrows them.
export const site = pgTable(
  "site",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // null = org/brand-level site; set = an agent's personal site within a brokerage
    ownerMemberId: text().references(() => member.id, { onDelete: "set null" }),
    name: text().notNull(),
    templateId: text().notNull().default("modern"),
    theme: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    pages: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [unique("site_organization_id_id_unique").on(table.organizationId, table.id)],
)

export const siteRevision = pgTable(
  "site_revision",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid().notNull(),
    organizationId: text().notNull(),
    kind: text().notNull(),
    document: jsonb().$type<Record<string, unknown>>().notNull(),
    schemaVersion: integer().notNull(),
    sourceDraftVersion: bigint({ mode: "bigint" }).notNull(),
    publicationNumber: bigint({ mode: "bigint" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: text().references(() => user.id, { onDelete: "set null" }),
    actorType: text().notNull(),
    reason: text(),
    basedOnRevisionId: uuid(),
  },
  (table) => [
    foreignKey({
      name: "site_revision_organization_site_fk",
      columns: [table.organizationId, table.siteId],
      foreignColumns: [site.organizationId, site.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "site_revision_based_on_revision_fk",
      columns: [table.organizationId, table.siteId, table.basedOnRevisionId],
      foreignColumns: [table.organizationId, table.siteId, table.id],
    }),
    unique("site_revision_organization_site_id_unique").on(
      table.organizationId,
      table.siteId,
      table.id,
    ),
    unique("site_revision_organization_site_id_kind_unique").on(
      table.organizationId,
      table.siteId,
      table.id,
      table.kind,
    ),
    unique("site_revision_site_publication_number_unique").on(
      table.siteId,
      table.publicationNumber,
    ),
    check("site_revision_kind_check", sql`${table.kind} in ('preview', 'published')`),
    check(
      "site_revision_publication_number_check",
      sql`(${table.kind} = 'published') = (${table.publicationNumber} is not null)`,
    ),
    check(
      "site_revision_actor_type_check",
      sql`${table.actorType} in ('user', 'migration', 'system')`,
    ),
    index("site_revision_organization_site_created_at_idx").on(
      table.organizationId,
      table.siteId,
      table.createdAt,
    ),
  ],
)

export const siteDocumentState = pgTable(
  "site_document_state",
  {
    siteId: uuid().primaryKey(),
    organizationId: text().notNull(),
    draftDocument: jsonb().$type<Record<string, unknown>>().notNull(),
    draftSchemaVersion: integer().notNull(),
    draftVersion: bigint({ mode: "bigint" }).notNull().default(sql`1`),
    draftUpdatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    draftUpdatedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    publishedRevisionId: uuid(),
    publishedRevisionKind: text().notNull().default("published"),
    nextPublicationNumber: bigint({ mode: "bigint" }).notNull().default(sql`1`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "site_document_state_organization_site_fk",
      columns: [table.organizationId, table.siteId],
      foreignColumns: [site.organizationId, site.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "site_document_state_published_revision_fk",
      columns: [
        table.organizationId,
        table.siteId,
        table.publishedRevisionId,
        table.publishedRevisionKind,
      ],
      foreignColumns: [
        siteRevision.organizationId,
        siteRevision.siteId,
        siteRevision.id,
        siteRevision.kind,
      ],
    }),
    unique("site_document_state_organization_site_unique").on(table.organizationId, table.siteId),
    check(
      "site_document_state_published_kind_check",
      sql`${table.publishedRevisionKind} = 'published'`,
    ),
  ],
)

export const sitePreviewGrant = pgTable(
  "site_preview_grant",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid().notNull(),
    organizationId: text().notNull(),
    revisionId: uuid().notNull(),
    revisionKind: text().notNull().default("preview"),
    tokenHash: bytea().notNull().unique(),
    createdByUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "site_preview_grant_revision_fk",
      columns: [table.organizationId, table.siteId, table.revisionId, table.revisionKind],
      foreignColumns: [
        siteRevision.organizationId,
        siteRevision.siteId,
        siteRevision.id,
        siteRevision.kind,
      ],
    }).onDelete("cascade"),
    check("site_preview_grant_revision_kind_check", sql`${table.revisionKind} = 'preview'`),
    check("site_preview_grant_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    index("site_preview_grant_expiry_idx").on(table.expiresAt),
  ],
)

// Tenant-scoped audit trail for document lifecycle actions (saves, deliberate conflict overrides,
// and — later — publish/rollback/preview). Never store document JSON or personal content here.
export const siteAuditEvent = pgTable(
  "site_audit_event",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text().notNull(),
    siteId: uuid().notNull(),
    actorUserId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "site_audit_event_organization_site_fk",
      columns: [table.organizationId, table.siteId],
      foreignColumns: [site.organizationId, site.id],
    }).onDelete("cascade"),
    index("site_audit_event_organization_site_created_at_idx").on(
      table.organizationId,
      table.siteId,
      table.createdAt,
    ),
  ],
)

// Vanity domains attach to a specific site. Backs the Caddy on-demand-TLS `ask` endpoint.
export const domain = pgTable("domain", {
  id: uuid().primaryKey().defaultRandom(),
  siteId: uuid()
    .notNull()
    .references(() => site.id, { onDelete: "cascade" }),
  hostname: text().notNull().unique(),
  // pending -> verified (DNS/CNAME confirmed) -> active (cert issued & serving)
  status: text().notNull().default("pending"),
  verificationToken: text().notNull(),
  isPrimary: boolean().notNull().default(false),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})
