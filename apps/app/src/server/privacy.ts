import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// Data & privacy self-service (M7-A7): a tenant owner can export all of their organization's data
// (a data-access request) and permanently delete the organization (erasure). @realtr/db imports stay
// dynamic + inside handlers (server-only pg), per the app convention.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

async function ownerAuth() {
  const { currentOrganizationAuthorization } = await import("./authorization")
  const result = await currentOrganizationAuthorization()
  if (!result.ok) return { ok: false as const, code: "unauthorized" as const }
  if (result.role !== "owner") return { ok: false as const, code: "forbidden" as const }
  return { ok: true as const, authorization: result }
}

/** Export everything Realtr holds for the caller's organization as JSON (owner only). */
export const exportMyOrgDataFn = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await ownerAuth()
  if (!auth.ok) return auth
  const { db } = await import("@realtr/db")
  const { exportOrganizationData } = await import("@realtr/db/data-export")
  const data = await exportOrganizationData(db, auth.authorization.organizationId)
  return { ok: true as const, data: data as unknown as Json }
})

const deleteInput = z.object({ confirmName: z.string() })

/**
 * Permanently delete the caller's organization and all its data (owner only). Requires the exact org
 * name as confirmation. Irreversible; the FK cascade removes every tenant-scoped row.
 */
export const deleteMyOrgFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => deleteInput.parse(input))
  .handler(async ({ data }) => {
    const auth = await ownerAuth()
    if (!auth.ok) return auth
    const { db, organization, eq } = await import("@realtr/db")
    const { deleteOrganization } = await import("@realtr/db/data-export")
    const { recordAdminAudit } = await import("@realtr/db/admin")

    const [org] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, auth.authorization.organizationId))
      .limit(1)
    if (!org) return { ok: false as const, code: "not_found" as const }
    if (data.confirmName.trim() !== org.name) {
      return { ok: false as const, code: "name_mismatch" as const }
    }

    // Record before the delete (the org FK is ON DELETE SET NULL, so the audit row survives erasure).
    const { getRequest } = await import("@tanstack/react-start/server")
    const { auth: betterAuth } = await import("../lib/auth")
    const session = await betterAuth.api.getSession({ headers: getRequest().headers })
    await recordAdminAudit(db, {
      actorEmail: session?.user?.email ?? "owner",
      action: "org.delete",
      targetOrganizationId: auth.authorization.organizationId,
      detail: { name: org.name, initiatedBy: "owner" },
    })
    await deleteOrganization(db, auth.authorization.organizationId)
    return { ok: true as const }
  })
