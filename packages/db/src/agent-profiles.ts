import { and, asc, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { agentProfile, member } from "./schema"
import type * as schema from "./schema"

export type AgentProfileDatabase = NodePgDatabase<typeof schema>

export interface AgentProfileRecord {
  id: string
  memberId: string
  slug: string
  displayName: string
  title: string | null
  photoUrl: string | null
  bio: string | null
  email: string | null
  phone: string | null
  socialLinks: Array<{ service: string; url: string }>
  visible: boolean
  rank: number | null
}

export interface AgentProfileInput {
  slug: string
  displayName: string
  title?: string | null
  photoUrl?: string | null
  bio?: string | null
  email?: string | null
  phone?: string | null
  socialLinks?: Array<{ service: string; url: string }>
  visible?: boolean
  rank?: number | null
}

function toRecord(row: typeof agentProfile.$inferSelect): AgentProfileRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    slug: row.slug,
    displayName: row.displayName,
    title: row.title,
    photoUrl: row.photoUrl,
    bio: row.bio,
    email: row.email,
    phone: row.phone,
    socialLinks: row.socialLinks,
    visible: row.visible,
    rank: row.rank,
  }
}

const byRank = sql`${agentProfile.rank} asc nulls last, ${agentProfile.displayName} asc`

/** All profiles in an org (management view), ordered by rank then name. */
export async function listAgentProfiles(
  database: AgentProfileDatabase,
  organizationId: string,
  options: { visibleOnly?: boolean } = {},
): Promise<AgentProfileRecord[]> {
  const conditions = [eq(agentProfile.organizationId, organizationId)]
  if (options.visibleOnly) conditions.push(eq(agentProfile.visible, true))
  const rows = await database
    .select()
    .from(agentProfile)
    .where(and(...conditions))
    .orderBy(byRank)
  return rows.map(toRecord)
}

export async function getAgentProfileByMember(
  database: AgentProfileDatabase,
  organizationId: string,
  memberId: string,
): Promise<AgentProfileRecord | null> {
  const [row] = await database
    .select()
    .from(agentProfile)
    .where(
      and(eq(agentProfile.organizationId, organizationId), eq(agentProfile.memberId, memberId)),
    )
    .limit(1)
  return row ? toRecord(row) : null
}

export async function getVisibleAgentProfileBySlug(
  database: AgentProfileDatabase,
  organizationId: string,
  slug: string,
): Promise<AgentProfileRecord | null> {
  const [row] = await database
    .select()
    .from(agentProfile)
    .where(
      and(
        eq(agentProfile.organizationId, organizationId),
        eq(agentProfile.slug, slug),
        eq(agentProfile.visible, true),
      ),
    )
    .limit(1)
  return row ? toRecord(row) : null
}

/** Create or update a member's profile (one per member). Tenant-scoped by (org, memberId). */
export async function upsertAgentProfile(
  database: AgentProfileDatabase,
  organizationId: string,
  memberId: string,
  input: AgentProfileInput,
): Promise<AgentProfileRecord> {
  const values = {
    organizationId,
    memberId,
    slug: input.slug,
    displayName: input.displayName,
    title: input.title ?? null,
    photoUrl: input.photoUrl ?? null,
    bio: input.bio ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    socialLinks: input.socialLinks ?? [],
    visible: input.visible ?? true,
    rank: input.rank ?? null,
  }
  const [row] = await database
    .insert(agentProfile)
    .values(values)
    .onConflictDoUpdate({
      target: [agentProfile.organizationId, agentProfile.memberId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  if (!row) throw new Error("Failed to upsert agent profile")
  return toRecord(row)
}

/** Members who have no profile yet — so admins can create one for a teammate. */
export async function listMembersWithoutProfile(
  database: AgentProfileDatabase,
  organizationId: string,
): Promise<Array<{ memberId: string; userId: string; role: string }>> {
  const rows = await database
    .select({ memberId: member.id, userId: member.userId, role: member.role })
    .from(member)
    .leftJoin(agentProfile, eq(agentProfile.memberId, member.id))
    .where(and(eq(member.organizationId, organizationId), sql`${agentProfile.id} is null`))
    .orderBy(asc(member.createdAt))
  return rows
}
