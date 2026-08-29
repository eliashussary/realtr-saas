import type { AgentProfileDatabase } from "@realtr/db/agent-profiles"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// Team management (members + invitations) and agent profiles. @realtr/db pulls in server-only code
// (pg), and this module is imported by client route components, so db/auth imports stay dynamic and
// inside handlers — the same convention as listings.ts / tenant.ts.

async function auth() {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  return result.ok ? result : null
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return base || "agent"
}

// ── Team roster + members ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  memberId: string
  userId: string
  name: string
  email: string
  role: string
  profile: { slug: string; displayName: string; title: string | null; visible: boolean } | null
}

export interface PendingInvite {
  id: string
  email: string
  role: string
  expiresAt: string
}

export const getTeamFn = createServerFn({ method: "GET" }).handler(async () => {
  const authorization = await auth()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  const { db, and, eq, asc, member, user, invitation } = await import("@realtr/db")
  const { agentProfile } = await import("@realtr/db/schema")

  const rows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      name: user.name,
      email: user.email,
      slug: agentProfile.slug,
      displayName: agentProfile.displayName,
      title: agentProfile.title,
      visible: agentProfile.visible,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(agentProfile, eq(agentProfile.memberId, member.id))
    .where(eq(member.organizationId, authorization.organizationId))
    .orderBy(asc(member.createdAt))

  const members: TeamMember[] = rows.map((r) => ({
    memberId: r.memberId,
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    profile: r.slug
      ? {
          slug: r.slug,
          displayName: r.displayName ?? r.name,
          title: r.title,
          visible: r.visible ?? true,
        }
      : null,
  }))

  const canManageMembers = can(authorization.role, "member", "create")
  let invites: PendingInvite[] = []
  if (canManageMembers) {
    const rawInvites = await db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, authorization.organizationId),
          eq(invitation.status, "pending"),
        ),
      )
    invites = rawInvites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role ?? "agent",
      expiresAt: i.expiresAt.toISOString(),
    }))
  }

  return {
    ok: true as const,
    canManageMembers,
    canAssignOwner: authorization.role === "owner",
    canEditAnyProfile: can(authorization.role, "agentProfile", "editAny"),
    myMemberId: authorization.memberId,
    myRole: authorization.role,
    members,
    invites,
  }
})

const inviteInput = z.object({
  email: z.string().trim().email().max(320),
  // Owners can be created only by transferring; invitations are admin or agent.
  role: z.enum(["admin", "agent"]),
  // Team: acknowledge the per-seat charge when inviting beyond the included seats (M6-A5).
  confirmSeatCharge: z.boolean().optional().default(false),
})

export const inviteMemberFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => inviteInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "invitation", "create")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { randomUUID } = await import("node:crypto")
    const { db, and, eq, member, user, invitation, count } = await import("@realtr/db")

    const email = data.email.toLowerCase()
    // Already a member?
    const existing = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, authorization.organizationId), eq(user.email, email)))
      .limit(1)
    if (existing[0]) return { ok: false as const, code: "already_member" as const }

    // Seat gate (M6-A5): a seat is a member OR a pending invitation. Solo is capped at 1; Team allows
    // inviting past the included seats only after the owner confirms the added per-seat charge.
    const { loadEntitlements, evaluateInvite } = await import("@realtr/core")
    const [{ value: memberCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, authorization.organizationId))
    const [{ value: pendingCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, authorization.organizationId),
          eq(invitation.status, "pending"),
        ),
      )
    const entitlements = await loadEntitlements(authorization.organizationId)
    const decision = evaluateInvite({
      entitlements,
      usedSeats: memberCount + pendingCount,
      confirmed: data.confirmSeatCharge,
    })
    if (decision.kind === "block") return { ok: false as const, code: decision.code }
    if (decision.kind === "confirm") {
      return {
        ok: false as const,
        code: "seat_charge_confirm" as const,
        addedMonthlyCents: decision.addedMonthlyCents,
      }
    }

    const id = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db
      .insert(invitation)
      .values({
        id,
        organizationId: authorization.organizationId,
        email,
        role: data.role,
        status: "pending",
        expiresAt,
        inviterId: authorization.userId,
      })
      .onConflictDoNothing()

    const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3001"
    const inviteUrl = `${appUrl}/accept-invite?id=${id}`
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n👥 Invite for ${email} (${data.role}):\n   ${inviteUrl}\n`)
    }
    return { ok: true as const, inviteUrl }
  })

export const cancelInvitationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ invitationId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "invitation", "cancel")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { db, and, eq, invitation } = await import("@realtr/db")
    await db
      .update(invitation)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(invitation.id, data.invitationId),
          eq(invitation.organizationId, authorization.organizationId),
        ),
      )
    return { ok: true as const }
  })

/** Accept an invitation as the signed-in user (called from the /accept-invite route). */
export const acceptInvitationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ invitationId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth: betterAuth } = await import("../lib/auth")
    const session = await betterAuth.api.getSession({ headers: getRequest().headers })
    if (!session) return { ok: false as const, code: "unauthenticated" as const }

    const { randomUUID } = await import("node:crypto")
    const { db, and, eq, member, invitation } = await import("@realtr/db")
    const [invite] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.id, data.invitationId))
      .limit(1)
    if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now()) {
      return { ok: false as const, code: "invalid" as const }
    }
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return { ok: false as const, code: "wrong_email" as const, email: invite.email }
    }

    const already = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.organizationId, invite.organizationId), eq(member.userId, session.user.id)),
      )
      .limit(1)
    if (!already[0]) {
      await db.insert(member).values({
        id: randomUUID(),
        organizationId: invite.organizationId,
        userId: session.user.id,
        role: invite.role ?? "agent",
      })
      // Team seat count changed → push the new quantity to Stripe (best-effort; M6-A5).
      const { syncSeatsForOrg } = await import("@realtr/core")
      await syncSeatsForOrg(invite.organizationId)
    }
    await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, invite.id))
    return { ok: true as const }
  })

const setRoleInput = z.object({
  memberId: z.string(),
  role: z.enum(["owner", "admin", "agent"]),
})

export const setMemberRoleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => setRoleInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "member", "update")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    // Only an owner may grant or revoke the owner role.
    const { db, and, eq, member } = await import("@realtr/db")
    const [target] = await db
      .select()
      .from(member)
      .where(
        and(eq(member.id, data.memberId), eq(member.organizationId, authorization.organizationId)),
      )
      .limit(1)
    if (!target) return { ok: false as const, code: "not_found" as const }
    if ((data.role === "owner" || target.role === "owner") && authorization.role !== "owner") {
      return { ok: false as const, code: "forbidden" as const }
    }
    // Never leave the org without an owner.
    if (target.role === "owner" && data.role !== "owner") {
      const owners = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.organizationId, authorization.organizationId), eq(member.role, "owner")),
        )
      if (owners.length <= 1) return { ok: false as const, code: "last_owner" as const }
    }
    await db.update(member).set({ role: data.role }).where(eq(member.id, data.memberId))
    return { ok: true as const }
  })

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ memberId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "member", "delete")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    if (data.memberId === authorization.memberId) {
      return { ok: false as const, code: "self" as const }
    }
    const { db, and, eq, member } = await import("@realtr/db")
    const [target] = await db
      .select()
      .from(member)
      .where(
        and(eq(member.id, data.memberId), eq(member.organizationId, authorization.organizationId)),
      )
      .limit(1)
    if (!target) return { ok: false as const, code: "not_found" as const }
    if (target.role === "owner" && authorization.role !== "owner") {
      return { ok: false as const, code: "forbidden" as const }
    }
    await db.delete(member).where(eq(member.id, data.memberId))
    // Team seat count changed → push the new quantity to Stripe (best-effort; M6-A5).
    const { syncSeatsForOrg } = await import("@realtr/core")
    await syncSeatsForOrg(authorization.organizationId)
    return { ok: true as const }
  })

// ── Agent profiles ────────────────────────────────────────────────────────────────────────────

export interface AgentProfileForm {
  displayName: string
  title: string
  photoUrl: string | null
  bio: string
  email: string
  phone: string
  socialLinks: Array<{ service: string; url: string }>
  visible: boolean
}

const profileInput = z.object({
  // Which member's profile — omitted means "mine".
  memberId: z.string().optional(),
  displayName: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional().default(""),
  photoUrl: z.string().url().max(2000).nullable().optional(),
  bio: z.string().trim().max(4000).optional().default(""),
  email: z.string().trim().max(320).optional().default(""),
  phone: z.string().trim().max(100).optional().default(""),
  socialLinks: z
    .array(z.object({ service: z.string().trim().max(50), url: z.string().url().max(2000) }))
    .max(10)
    .optional()
    .default([]),
  visible: z.boolean().optional().default(true),
})

/** Load a member's profile form (defaults from the user record when none exists yet). */
export const getAgentProfileFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ memberId: z.string().optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const targetMemberId = data.memberId ?? authorization.memberId
    const isSelf = targetMemberId === authorization.memberId
    if (!isSelf && !can(authorization.role, "agentProfile", "editAny")) {
      return { ok: false as const, code: "forbidden" as const }
    }

    const { db, and, eq, member, user } = await import("@realtr/db")
    const { getAgentProfileByMember } = await import("@realtr/db/agent-profiles")
    const [m] = await db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.id, targetMemberId), eq(member.organizationId, authorization.organizationId)),
      )
      .limit(1)
    if (!m) return { ok: false as const, code: "not_found" as const }

    const profile = await getAgentProfileByMember(db, authorization.organizationId, targetMemberId)
    const form: AgentProfileForm = profile
      ? {
          displayName: profile.displayName,
          title: profile.title ?? "",
          photoUrl: profile.photoUrl,
          bio: profile.bio ?? "",
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          socialLinks: profile.socialLinks,
          visible: profile.visible,
        }
      : {
          displayName: m.name || m.email,
          title: "",
          photoUrl: null,
          bio: "",
          email: m.email,
          phone: "",
          socialLinks: [],
          visible: true,
        }
    return { ok: true as const, form, exists: Boolean(profile), memberId: targetMemberId }
  })

// Called only when a member has no profile yet, so any existing slug belongs to another member.
async function uniqueSlug(
  db: AgentProfileDatabase,
  organizationId: string,
  displayName: string,
): Promise<string> {
  const { and, eq } = await import("@realtr/db")
  const { agentProfile } = await import("@realtr/db/schema")
  const base = slugify(displayName)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const [clash] = await db
      .select({ id: agentProfile.id })
      .from(agentProfile)
      .where(and(eq(agentProfile.organizationId, organizationId), eq(agentProfile.slug, candidate)))
      .limit(1)
    if (!clash) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export const saveAgentProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => profileInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await auth()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const targetMemberId = data.memberId ?? authorization.memberId
    const isSelf = targetMemberId === authorization.memberId
    const allowed = isSelf
      ? can(authorization.role, "agentProfile", "editOwn")
      : can(authorization.role, "agentProfile", "editAny")
    if (!allowed) return { ok: false as const, code: "forbidden" as const }

    const { db, and, eq, member } = await import("@realtr/db")
    const { upsertAgentProfile, getAgentProfileByMember } = await import(
      "@realtr/db/agent-profiles"
    )
    // The member must belong to this org.
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.id, targetMemberId), eq(member.organizationId, authorization.organizationId)),
      )
      .limit(1)
    if (!m) return { ok: false as const, code: "not_found" as const }

    const existing = await getAgentProfileByMember(db, authorization.organizationId, targetMemberId)
    const slug =
      existing?.slug ?? (await uniqueSlug(db, authorization.organizationId, data.displayName))
    await upsertAgentProfile(db, authorization.organizationId, targetMemberId, {
      slug,
      displayName: data.displayName,
      title: data.title || null,
      photoUrl: data.photoUrl ?? null,
      bio: data.bio || null,
      email: data.email || null,
      phone: data.phone || null,
      socialLinks: data.socialLinks,
      visible: data.visible,
      rank: existing?.rank ?? null,
    })
    return { ok: true as const, slug }
  })
