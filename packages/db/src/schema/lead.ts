import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"
import { listing } from "./listing"
import { site } from "./site"

// Lead capture seam (M4). Tenant-scoped inquiries with an assignment hook so distribution to agents
// is additive. The capture forms, inbox, distribution rules, and pipeline UI are a later milestone;
// this table locks the shape (store-before-deliver, per-agent assignment, listing/site context).
export const lead = pgTable(
  "lead",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Distribution target. Null = unassigned pool. Set on capture (by listing agent / round-robin).
    assignedMemberId: text().references(() => member.id, { onDelete: "set null" }),
    siteId: uuid().references(() => site.id, { onDelete: "set null" }),
    listingId: uuid().references(() => listing.id, { onDelete: "set null" }),
    source: text().notNull().default("contact_form"), // contact_form | listing_inquiry | ...
    status: text().notNull().default("new"), // new | contacted | qualified | won | lost
    name: text(),
    email: text(),
    phone: text(),
    message: text(),
    consent: boolean().notNull().default(false),
    pagePath: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("lead_org_created_idx").on(t.organizationId, t.createdAt),
    index("lead_org_assigned_idx").on(t.organizationId, t.assignedMemberId),
  ],
)
