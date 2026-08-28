import { LISTING_SOURCE_KIND } from "@realtr/core"
import {
  and,
  db,
  desc,
  eq,
  integration,
  listing,
  listingSyncRun,
  organization,
  sql,
} from "@realtr/db"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { runTenantListingSync } from "./listings"
import { isCurrentUserSuperAdmin } from "./super-admin"

const PROVIDER = "ddf"

export interface AdminIntegrationRow {
  organizationId: string
  organizationName: string
  status: string
  syncPaused: boolean
  activeListings: number
  lastSync: {
    status: string
    mode: string
    upserted: number
    removed: number
    error: string | null
    finishedAt: string | null
  } | null
}

async function activeCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listing)
    .where(
      and(
        eq(listing.organizationId, organizationId),
        eq(listing.source, PROVIDER),
        eq(listing.status, "active"),
      ),
    )
  return row?.count ?? 0
}

async function lastRun(organizationId: string): Promise<AdminIntegrationRow["lastSync"]> {
  const [run] = await db
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
  return run ? { ...run, finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null } : null
}

/** All tenants' DDF integrations with health, for the super-admin console. */
export const adminListIntegrationsFn = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isCurrentUserSuperAdmin())) return { ok: false as const, code: "forbidden" as const }

  const integrations = await db
    .select({
      organizationId: integration.organizationId,
      organizationName: organization.name,
      status: integration.status,
      syncPaused: integration.syncPaused,
    })
    .from(integration)
    .innerJoin(organization, eq(organization.id, integration.organizationId))
    .where(and(eq(integration.kind, LISTING_SOURCE_KIND), eq(integration.provider, PROVIDER)))
    .orderBy(organization.name)

  const rows: AdminIntegrationRow[] = []
  for (const row of integrations) {
    rows.push({
      ...row,
      activeListings: await activeCount(row.organizationId),
      lastSync: await lastRun(row.organizationId),
    })
  }
  return { ok: true as const, integrations: rows }
})

const adminSyncInput = z.object({
  organizationId: z.string().min(1),
  mode: z.enum(["incremental", "reconcile"]).default("incremental"),
})

/** Trigger an immediate sync for any tenant (super admin). */
export const adminSyncFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminSyncInput.parse(input))
  .handler(async ({ data }) => {
    if (!(await isCurrentUserSuperAdmin()))
      return { ok: false as const, code: "forbidden" as const }
    return runTenantListingSync(data.organizationId, data.mode)
  })

const adminPauseInput = z.object({ organizationId: z.string().min(1), paused: z.boolean() })

/** Pause or resume a tenant's scheduled sync (super admin). */
export const adminSetPausedFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminPauseInput.parse(input))
  .handler(async ({ data }) => {
    if (!(await isCurrentUserSuperAdmin()))
      return { ok: false as const, code: "forbidden" as const }
    await db
      .update(integration)
      .set({ syncPaused: data.paused, updatedAt: new Date() })
      .where(
        and(
          eq(integration.organizationId, data.organizationId),
          eq(integration.kind, LISTING_SOURCE_KIND),
          eq(integration.provider, PROVIDER),
        ),
      )
    return { ok: true as const }
  })
