import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// CRM connect/test/disconnect for the dashboard. Follow Up Boss first. @realtr/db / @realtr/core
// imports stay dynamic and inside handlers (server-only pg code) — same convention as listings.ts.

const PROVIDER = "fub"

const apiKeyInput = z.object({ apiKey: z.string().trim().min(1).max(200) })

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

async function verify(organizationId: string, apiKey: string) {
  const { getCrm } = await import("@realtr/core")
  const provider = getCrm(PROVIDER)
  if (!provider) return { ok: false as const, error: "Unknown CRM" }
  return provider.testConnection({ config: { apiKey }, organizationId })
}

/** Test an API key without persisting it. */
export const testCrmFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => apiKeyInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "integration", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const result = await verify(authorization.organizationId, data.apiKey)
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, code: "verify_failed" as const, message: result.error }
  })

/** Verify, then store the API key encrypted and mark the CRM connected. */
export const connectCrmFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => apiKeyInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "integration", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    // Entitlement gate (M6-A5): connecting an integration requires an in-good-standing subscription.
    const { loadEntitlements } = await import("@realtr/core")
    if (!(await loadEntitlements(authorization.organizationId)).canManageIntegrations) {
      return { ok: false as const, code: "payment_required" as const }
    }
    const verified = await verify(authorization.organizationId, data.apiKey)
    if (!verified.ok) {
      return { ok: false as const, code: "verify_failed" as const, message: verified.error }
    }
    const { CRM_KIND, encryptIntegrationConfig } = await import("@realtr/core")
    const { db, integration } = await import("@realtr/db")
    const encrypted = encryptIntegrationConfig({ apiKey: data.apiKey }) as unknown as Record<
      string,
      unknown
    >
    await db
      .insert(integration)
      .values({
        organizationId: authorization.organizationId,
        kind: CRM_KIND,
        provider: PROVIDER,
        config: encrypted,
        status: "connected",
      })
      .onConflictDoUpdate({
        target: [integration.organizationId, integration.kind, integration.provider],
        set: { config: encrypted, status: "connected", updatedAt: new Date() },
      })
    return { ok: true as const }
  })

/** Disconnect the CRM. Delivered leads keep their status; new leads will be marked skipped. */
export const disconnectCrmFn = createServerFn({ method: "POST" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  if (!can(authorization.role, "integration", "manage")) {
    return { ok: false as const, code: "forbidden" as const }
  }
  const { CRM_KIND } = await import("@realtr/core")
  const { db, and, eq, integration } = await import("@realtr/db")
  await db
    .update(integration)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(
      and(
        eq(integration.organizationId, authorization.organizationId),
        eq(integration.kind, CRM_KIND),
        eq(integration.provider, PROVIDER),
      ),
    )
  return { ok: true as const }
})

export const getCrmStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  const { CRM_KIND } = await import("@realtr/core")
  const { db, and, eq, integration } = await import("@realtr/db")
  const [row] = await db
    .select({ status: integration.status, updatedAt: integration.updatedAt })
    .from(integration)
    .where(
      and(
        eq(integration.organizationId, authorization.organizationId),
        eq(integration.kind, CRM_KIND),
        eq(integration.provider, PROVIDER),
      ),
    )
    .limit(1)
  return {
    ok: true as const,
    provider: PROVIDER,
    status: row?.status ?? "disconnected",
    canManage: can(authorization.role, "integration", "manage"),
  }
})
