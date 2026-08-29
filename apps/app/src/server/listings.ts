import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { can } from "../lib/permissions"

// @realtr/core and @realtr/db pull in server-only code (pg → Buffer). This module's server
// functions are imported by a client component (listings-card), so those imports must stay
// dynamic and inside handlers — the same convention as tenant.ts / site-fns.ts — to keep them
// out of the browser bundle.

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

/** May this member edit/delete a specific listing row? Admins manage any; agents only their own. */
function mayManageListing(
  authorization: { role: string; memberId: string },
  row: { memberId: string | null },
): boolean {
  if (can(authorization.role, "listing", "manageAny")) return true
  return can(authorization.role, "listing", "manageOwn") && row.memberId === authorization.memberId
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
  const { getSource } = await import("@realtr/core")
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
    if (!can(authorization.role, "integration", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }
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
    if (!can(authorization.role, "integration", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }

    const config = { clientId: data.clientId, clientSecret: data.clientSecret }
    const verified = await verifyCredentials(authorization.organizationId, config)
    if (!verified.ok) {
      return { ok: false as const, code: "verify_failed" as const, message: verified.message }
    }

    const { LISTING_SOURCE_KIND, encryptIntegrationConfig } = await import("@realtr/core")
    const { db, integration } = await import("@realtr/db")
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

const syncModeInput = z.object({
  mode: z.enum(["incremental", "reconcile"]).default("incremental"),
})

export type TenantSyncResult =
  | { ok: true; upserted: number; removed: number }
  | { ok: false; code: "not_connected" | "unknown_provider" | "sync_failed"; message?: string }

/** Run a listing sync inline (used by the manual "sync now" and admin actions). */
export async function runTenantListingSync(
  organizationId: string,
  mode: "incremental" | "reconcile",
): Promise<TenantSyncResult> {
  const { getSource, loadListingSourceConfig, runListingSync } = await import("@realtr/core")
  const { db } = await import("@realtr/db")
  const { createListingRepository } = await import("@realtr/db/listings")
  const source = getSource(PROVIDER)
  if (!source) return { ok: false, code: "unknown_provider" }
  const config = await loadListingSourceConfig(organizationId, PROVIDER)
  if (!config) return { ok: false, code: "not_connected" }
  try {
    const result = await runListingSync({
      organizationId,
      provider: PROVIDER,
      source,
      config,
      mode,
      repository: createListingRepository(db),
    })
    return { ok: true, upserted: result.upserted, removed: result.removed }
  } catch (error) {
    return { ok: false, code: "sync_failed", message: safeMessage(error) }
  }
}

/** Manual "sync now" for the current tenant — runs a sync immediately and returns the counts. */
export const syncListingSourceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => syncModeInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "integration", "manage")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    return runTenantListingSync(authorization.organizationId, data.mode)
  })

/** Disconnect: stop serving (mark this tenant's listings removed) and mark the integration off. */
export const disconnectListingSourceFn = createServerFn({ method: "POST" }).handler(async () => {
  const authorization = await resolveAuthorizationOrNull()
  if (!authorization) return { ok: false as const, code: "unauthorized" as const }
  if (!can(authorization.role, "integration", "manage")) {
    return { ok: false as const, code: "forbidden" as const }
  }

  const { LISTING_SOURCE_KIND } = await import("@realtr/core")
  const { db, and, eq, integration } = await import("@realtr/db")
  const { createListingRepository } = await import("@realtr/db/listings")
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

  const { LISTING_SOURCE_KIND } = await import("@realtr/core")
  const { db, and, desc, eq, integration, listing, listingSyncRun, listingSyncState, sql } =
    await import("@realtr/db")

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

  const { isCurrentUserSuperAdmin } = await import("./super-admin")
  return {
    ok: true as const,
    canManage: can(authorization.role, "integration", "manage"),
    isSuperAdmin: await isCurrentUserSuperAdmin(),
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

// ── Listings management (read-only view + featured curation) ────────────────────────────────────

export interface ListingListItem {
  id: string
  source: string
  status: string
  featured: boolean
  featuredRank: number | null
  memberId: string | null
  sourceListingId: string
  address: string | null
  cityProvince: string | null
  price: string | null
  primaryPhoto: string | null
  beds: number | null
  baths: number | null
  propertyType: string | null
}

const priceFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
})

/** Compact summary of a listing's opaque `data` payload for the management table. */
function summarize(
  data: Record<string, unknown>,
): Omit<
  ListingListItem,
  "id" | "source" | "status" | "featured" | "featuredRank" | "memberId" | "sourceListingId"
> {
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null
  const address = rec(data.address)
  const city = str(address.city)
  const province = str(address.province)
  const priceValue = num(data.listPrice)
  const media = Array.isArray(data.media) ? (data.media as Array<Record<string, unknown>>) : []
  const primaryPhoto = str(media[0]?.url)
  return {
    address: str(address.unparsed),
    cityProvince: city && province ? `${city}, ${province}` : (city ?? province ?? null),
    price: priceValue !== null ? priceFormatter.format(priceValue) : null,
    primaryPhoto,
    beds: num(data.bedrooms),
    baths: num(data.bathrooms),
    propertyType: str(data.propertyType),
  }
}

const listQueryInput = z.object({
  status: z.enum(["active", "removed"]).optional(),
  source: z.string().max(40).optional(),
  search: z.string().max(200).optional(),
})

/** Tenant-scoped listings for the dashboard table. Read-only; any member may view. */
export const listListingsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listQueryInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const { db } = await import("@realtr/db")
    const { listListingsForOrg } = await import("@realtr/db/listings")
    const rows = await listListingsForOrg(db, authorization.organizationId, {
      status: data.status,
      source: data.source,
      search: data.search,
    })
    const items: ListingListItem[] = rows.map((r) => ({
      id: r.id,
      source: r.source,
      status: r.status,
      featured: r.featured,
      featuredRank: r.featuredRank,
      memberId: r.memberId,
      sourceListingId: r.sourceListingId,
      ...summarize(r.data),
    }))
    const role = authorization.role
    return {
      ok: true as const,
      // Granular capabilities so the table can show the right controls per role and per row.
      canFeature: can(role, "listing", "feature"),
      canCreate: can(role, "listing", "create"),
      canManageAny: can(role, "listing", "manageAny"),
      canManageOwn: can(role, "listing", "manageOwn"),
      memberId: authorization.memberId,
      items,
    }
  })

const setFeaturedInput = z.object({
  listingId: z.string().uuid(),
  featured: z.boolean(),
  rank: z.number().int().min(0).max(9999).nullable().optional(),
})

/** Feature / un-feature a listing (site curation — owner/admin). DDF and exclusive listings alike. */
export const setListingFeaturedFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => setFeaturedInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "listing", "feature")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { db } = await import("@realtr/db")
    const { setListingFeatured } = await import("@realtr/db/listings")
    const updated = await setListingFeatured(
      db,
      authorization.organizationId,
      data.listingId,
      data.featured,
      data.rank ?? null,
    )
    if (updated === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })

// ── Exclusive (manual) listings ─────────────────────────────────────────────────────────────────

export interface ExclusiveListingForm {
  address: string
  city: string
  province: string
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  livingArea: number | null
  propertyType: string
  description: string
  photos: string[]
}

const exclusiveInput = z.object({
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).optional().default(""),
  province: z.string().trim().max(120).optional().default(""),
  price: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  bedrooms: z.number().int().min(0).max(100).nullable().optional(),
  bathrooms: z.number().int().min(0).max(100).nullable().optional(),
  livingArea: z.number().int().min(0).max(10_000_000).nullable().optional(),
  propertyType: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  photos: z.array(z.string().url().max(2000)).max(24).optional().default([]),
})

type ExclusiveInput = z.infer<typeof exclusiveInput>

/** Build DDF-normalized `data` from the form so the renderer view-model renders it unchanged. */
function buildManualData(input: ExclusiveInput): Record<string, unknown> {
  return {
    listPrice: input.price ?? undefined,
    propertyType: input.propertyType || undefined,
    bedrooms: input.bedrooms ?? undefined,
    bathrooms: input.bathrooms ?? undefined,
    livingArea: input.livingArea ?? undefined,
    livingAreaUnits: input.livingArea != null ? "sqft" : undefined,
    publicRemarks: input.description || undefined,
    address: {
      unparsed: input.address,
      city: input.city || undefined,
      province: input.province || undefined,
    },
    media: input.photos.map((url, order) => ({ url, order })),
  }
}

export const createExclusiveListingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => exclusiveInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    if (!can(authorization.role, "listing", "create")) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const { randomUUID } = await import("node:crypto")
    const { db } = await import("@realtr/db")
    const { createManualListing } = await import("@realtr/db/listings")
    // Synthesize a stable tenant-local identity (ADR 0006: sourceKey is the dedup identity even for
    // non-DDF rows). A manual listing's identity is its own generated key. The creating member owns
    // it, so agents can manage their own listings.
    const id = randomUUID()
    await createManualListing(db, authorization.organizationId, {
      sourceListingId: id,
      sourceKey: id,
      memberId: authorization.memberId,
      data: buildManualData(data),
    })
    return { ok: true as const, id }
  })

const updateExclusiveInput = exclusiveInput.extend({ listingId: z.string().uuid() })

export const updateExclusiveListingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateExclusiveInput.parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const { listingId, ...fields } = data
    const { db } = await import("@realtr/db")
    const { getListingById, updateManualListing, MANUAL_SOURCE } = await import(
      "@realtr/db/listings"
    )
    const row = await getListingById(db, authorization.organizationId, listingId)
    if (!row || row.source !== MANUAL_SOURCE)
      return { ok: false as const, code: "not_found" as const }
    if (!mayManageListing(authorization, row)) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const updated = await updateManualListing(
      db,
      authorization.organizationId,
      listingId,
      buildManualData(fields),
    )
    if (updated === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })

export const deleteExclusiveListingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const { db } = await import("@realtr/db")
    const { getListingById, deleteManualListing, MANUAL_SOURCE } = await import(
      "@realtr/db/listings"
    )
    const row = await getListingById(db, authorization.organizationId, data.listingId)
    if (!row || row.source !== MANUAL_SOURCE)
      return { ok: false as const, code: "not_found" as const }
    if (!mayManageListing(authorization, row)) {
      return { ok: false as const, code: "forbidden" as const }
    }
    const removed = await deleteManualListing(db, authorization.organizationId, data.listingId)
    if (removed === 0) return { ok: false as const, code: "not_found" as const }
    return { ok: true as const }
  })

/** Load one exclusive listing's editable fields for the edit form. */
export const getExclusiveListingFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const authorization = await resolveAuthorizationOrNull()
    if (!authorization) return { ok: false as const, code: "unauthorized" as const }
    const { db } = await import("@realtr/db")
    const { getListingById, MANUAL_SOURCE } = await import("@realtr/db/listings")
    const row = await getListingById(db, authorization.organizationId, data.listingId)
    // not_found for both missing and unauthorized rows, to avoid existence disclosure.
    if (!row || row.source !== MANUAL_SOURCE || !mayManageListing(authorization, row)) {
      return { ok: false as const, code: "not_found" as const }
    }
    const d = row.data
    const rec = (v: unknown): Record<string, unknown> =>
      v && typeof v === "object" ? (v as Record<string, unknown>) : {}
    const str = (v: unknown): string => (typeof v === "string" ? v : "")
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null
    const address = rec(d.address)
    const media = Array.isArray(d.media) ? (d.media as Array<Record<string, unknown>>) : []
    const form: ExclusiveListingForm = {
      address: str(address.unparsed),
      city: str(address.city),
      province: str(address.province),
      price: num(d.listPrice),
      bedrooms: num(d.bedrooms),
      bathrooms: num(d.bathrooms),
      livingArea: num(d.livingArea),
      propertyType: str(d.propertyType),
      description: str(d.publicRemarks),
      photos: media.map((m) => str(m.url)).filter(Boolean),
    }
    return { ok: true as const, form }
  })
