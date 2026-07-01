import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { member, organization } from "./auth"

// A tenant (organization) has many sites: solo realtor = 1; brokerage = brand site + agent sites.
// `theme`/`pages` are loosely typed jsonb here (the DB layer stays a leaf); the render layer
// (@realtr/ui ThemeTokens, @realtr/site Puck data) narrows them.
export const site = pgTable("site", {
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
})

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
