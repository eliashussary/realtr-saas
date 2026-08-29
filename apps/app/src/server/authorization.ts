import { and, asc, db, eq, member, site } from "@realtr/db"

export type AuthorizationFailureCode = "unauthenticated" | "forbidden" | "not_found"

export interface AuthorizationFailure {
  ok: false
  code: AuthorizationFailureCode
}

export interface OrganizationAuthorization {
  ok: true
  userId: string
  organizationId: string
  memberId: string
  role: string
}

export type OrganizationAuthorizationResult = OrganizationAuthorization | AuthorizationFailure

export interface AuthorizationSession {
  user: { id: string }
  session: { activeOrganizationId?: string | null }
}

/**
 * Resolves the active tenant exclusively from an authenticated server session and membership rows.
 * An explicitly active organization is never accepted unless the user is a member of it.
 */
export async function resolveOrganizationAuthorization(
  session: AuthorizationSession | null,
): Promise<OrganizationAuthorizationResult> {
  if (!session) return { ok: false, code: "unauthenticated" }

  const activeOrganizationId = session.session.activeOrganizationId
  const memberships = await db
    .select()
    .from(member)
    .where(
      activeOrganizationId
        ? and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrganizationId))
        : eq(member.userId, session.user.id),
    )
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1)

  const membership = memberships[0]
  if (!membership) return { ok: false, code: "forbidden" }

  return {
    ok: true,
    userId: session.user.id,
    organizationId: membership.organizationId,
    memberId: membership.id,
    role: membership.role,
  }
}

/** Resolve the current request's organization authorization from its session. */
export async function currentOrganizationAuthorization(): Promise<OrganizationAuthorizationResult> {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  return resolveOrganizationAuthorization(session)
}

/** A target organization is a constraint to verify, never authorization proof. */
export function authorizeOrganizationTarget(
  authorization: OrganizationAuthorization,
  targetOrganizationId: string,
): OrganizationAuthorization | AuthorizationFailure {
  return authorization.organizationId === targetOrganizationId
    ? authorization
    : { ok: false, code: "forbidden" }
}

/** Returns not_found for both absent and other-tenant site IDs to avoid existence disclosure. */
export async function findAuthorizedSite(
  authorization: OrganizationAuthorization,
  siteId: string,
): Promise<typeof site.$inferSelect | AuthorizationFailure> {
  const [authorizedSite] = await db
    .select()
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.organizationId, authorization.organizationId)))
    .limit(1)

  return authorizedSite ?? { ok: false, code: "not_found" }
}
