import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { organization } from "./auth"

// Platform-level audit trail for privileged super-admin actions (M7-A1). Distinct from the
// tenant-scoped siteAuditEvent (document lifecycle): this records cross-tenant operator actions —
// triggering a sync, pausing a tenant, extending a grace window — so support actions are accountable.
// Append-only; never written from tenant-facing code.
export const adminAuditEvent = pgTable(
  "admin_audit_event",
  {
    id: uuid().primaryKey().defaultRandom(),
    // The super-admin who performed the action (email from the session allowlist).
    actorEmail: text().notNull(),
    // A stable action slug, e.g. "sync.trigger", "sync.pause", "billing.extend_grace".
    action: text().notNull(),
    // The tenant the action targeted, when applicable. Set null if the org is later deleted so the
    // audit row survives.
    targetOrganizationId: text().references(() => organization.id, { onDelete: "set null" }),
    // Free-form action parameters / outcome (never secrets).
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_event_created_idx").on(t.createdAt),
    index("admin_audit_event_org_idx").on(t.targetOrganizationId),
  ],
)
