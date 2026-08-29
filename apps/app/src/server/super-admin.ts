// Super admin is a *platform* role, orthogonal to org membership: an allowlist of emails in
// SUPER_ADMIN_EMAILS (comma-separated). It grants cross-tenant operational visibility and control
// (trigger a sync, pause/resume a tenant's schedule) — never the ability to edit tenant content.

function superAdminEmails(): Set<string> {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

async function sessionEmail(): Promise<string | null> {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const email = session?.user?.email
  return email ? email.toLowerCase() : null
}

export async function isCurrentUserSuperAdmin(): Promise<boolean> {
  const email = await sessionEmail()
  return email !== null && superAdminEmails().has(email)
}

/** The current user's email if they are a super admin, else null — for audit attribution. */
export async function currentSuperAdminEmail(): Promise<string | null> {
  const email = await sessionEmail()
  return email !== null && superAdminEmails().has(email) ? email : null
}
