import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// An agent's public-facing profile — orthogonal to their RBAC role. Any member (owner, admin, or
// agent) may have one and be showcased on the site; `visible` toggles public display. One profile
// per member. Photo is a public URL from the asset store.
export const agentProfile = pgTable(
  "agent_profile",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    slug: text().notNull(), // stable public identifier, unique per org
    displayName: text().notNull(),
    title: text(), // e.g. "Sales Representative"
    photoUrl: text(),
    bio: text(),
    email: text(),
    phone: text(),
    socialLinks: jsonb().$type<Array<{ service: string; url: string }>>().notNull().default([]),
    visible: boolean().notNull().default(true),
    rank: integer(), // display order among agents; lower first, nulls last
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("agent_profile_org_member_unique").on(t.organizationId, t.memberId),
    unique("agent_profile_org_slug_unique").on(t.organizationId, t.slug),
  ],
)
