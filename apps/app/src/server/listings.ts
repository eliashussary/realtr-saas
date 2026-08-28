import { LISTING_SOURCE_KIND, encryptIntegrationConfig, getSource } from "@realtr/core"
import {
  and,
  db,
  desc,
  eq,
  integration,
  listing,
  listingSyncRun,
  listingSyncState,
  sql,
} from "@realtr/db"
import { createListingRepository } from "@realtr/db/listings"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// MVP has one listing source. Tenants self-provision their own DDF Web API key (ADR 0006) and
// connect it here; the worker then syncs on a schedule.
const PROVIDER = "ddf"

const credentialsInput = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
})

async function resolveAuthorizationOrNull() {
  const { getRequest } = await import("@tanstack/react-start/server")
  const { auth } = await import("../lib/auth")
  const { resolveOrganizationAuthorization } = await import("./authorization")
  const session = await auth.api.getSession({ headers: getRequest().headers })
  const authorization = await resolveOrganizationAuthorization(session)
  return authorization.ok ? authorization : null
}

function canManage(role: string): boolean {
  return role === "owner" || role === "admin"
}

/** Keep provider error text safe to surface (DDF errors carry status codes, not secrets). */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Connection failed"
  return message.slice(0, 200)
}

async function verifyCredentials(
  organizationId: string,
  config: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const source = getSource(PROVIDER)
  if (!source) return { ok: false, message: "Unknown provider" }
  try {
    await source.verify({ config, organizationId })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: safeMessage(error) }
  }
}

/** Test credentials without persisting them (the connect dialog's "Test" button). */
export const testListingSourceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!canManage(authorization.role)) return { ok: false as const, code: "forbidden" as const }
    const result = await verifyCredentials(authorization.organizationId, data)
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, code: "verify_failed" as const, message: result.message }
  })

/** Verify, then store the credentials encrypted and mark the integration connected. */
export const connectListingSourceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => credentialsInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!canManage(authorization.role)) return { ok: false as const, code: "forbidden" as const }

    const config = { clientId: data.clientId, clientSecret: data.clientSecret }
    const verified = await verifyCredentials(authorization.organizationId, config)
    if (!verified.ok) {
      return { ok: false as const, code: "verify_failed" as const, message: verified.message }
    }

    const encrypted = encryptIntegrationConfig(config) as unknown as Record<string, unknown>
    await db
      .insert(integration)
      .values({
        organizationId: authorization.organizationId,
        kind: LISTING_SOURCE_KIND,
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

/** Disconnect: stop serving (mark this tenant's listings removed) and mark the integration off. */
export const disconnectListingSourceFn = createServerFn({ method: "POST" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  if (!canManage(authorization.role)) return { ok: false as const, code: "forbidden" as const }

  await db
    .update(integration)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(
      and(
        eq(integration.organizationId, authorization.organizationId),
        eq(integration.kind, LISTING_SOURCE_KIND),
        eq(integration.provider, PROVIDER),
      ),
    )
  // Stop serving immediately; a full purge follows the retention policy (ADR 0006 follow-up).
  await createListingRepository(db).markRemovedNotIn(authorization.organizationId, PROVIDER, [])
  return { ok: true as const }
})

export const getListingStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  const organizationId = authorization.organizationId

  const [row] = await db
    .select({ status: integration.status, updatedAt: integration.updatedAt })
    .from(integration)
    .where(
      and(
        eq(integration.organizationId, organizationId),
        eq(integration.kind, LISTING_SOURCE_KIND),
        eq(integration.provider, PROVIDER),
      ),
    )
    .limit(1)

  const [lastRun] = await db
    .select({
      status: listingSyncRun.status,
      mode: listingSyncRun.mode,
      upserted: listingSyncRun.upserted,
      removed: listingSyncRun.removed,
      error: listingSyncRun.error,
      finishedAt: listingSyncRun.finishedAt,
    })
    .from(listingSyncRun)
    .where(
      and(eq(listingSyncRun.organizationId, organizationId), eq(listingSyncRun.provider, PROVIDER)),
    )
    .orderBy(desc(listingSyncRun.createdAt))
    .limit(1)

  const [state] = await db
    .select({ lastReconciledAt: listingSyncState.lastReconciledAt })
    .from(listingSyncState)
    .where(
      and(
        eq(listingSyncState.organizationId, organizationId),
        eq(listingSyncState.provider, PROVIDER),
      ),
    )
    .limit(1)

  const [counts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listing)
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.source, PROVIDER),
        eq(listing.status, "active"),
      ),
    )

  return {
    ok: true as const,
    canManage: canManage(authorization.role),
    status: row?.status ?? "disconnected",
    activeListings: counts?.count ?? 0,
    lastReconciledAt: state?.lastReconciledAt?.toISOString() ?? null,
    lastSync: lastRun
      ? {
          status: lastRun.status,
          mode: lastRun.mode,
          upserted: lastRun.upserted,
          removed: lastRun.removed,
          error: lastRun.error,
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
        }
      : null,
  }
})
