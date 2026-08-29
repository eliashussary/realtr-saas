import { and, db, eq, integration } from "@realtr/db"
import { decryptJson, encryptJson } from "../crypto"

// Integration config storage + retrieval. Credentials are encrypted at the app layer
// (INTEGRATION_ENCRYPTION_KEY) and stored in `integration.config` as `{ enc: "<payload>" }`. The
// connect UI (M3-A6a) writes them with `encryptIntegrationConfig`; the worker reads them with
// `loadListingSourceConfig`.

export const LISTING_SOURCE_KIND = "listing_source"
export const CRM_KIND = "crm"

export interface StoredIntegrationConfig {
  enc: string
}

export function encryptIntegrationConfig(value: Record<string, unknown>): StoredIntegrationConfig {
  return { enc: encryptJson(value) }
}

export function decryptIntegrationConfig(stored: unknown): Record<string, unknown> {
  const enc = (stored as StoredIntegrationConfig | null)?.enc
  if (typeof enc !== "string") throw new Error("integration config is not encrypted")
  return decryptJson<Record<string, unknown>>(enc)
}

/** Decrypted config for a tenant's connected listing source, or null if none/not connected. */
export async function loadListingSourceConfig(
  organizationId: string,
  provider: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ config: integration.config, status: integration.status })
    .from(integration)
    .where(
      and(
        eq(integration.organizationId, organizationId),
        eq(integration.provider, provider),
        eq(integration.kind, LISTING_SOURCE_KIND),
      ),
    )
    .limit(1)
  if (!row || row.status !== "connected") return null
  return decryptIntegrationConfig(row.config)
}

/** Decrypted config for a tenant's connected CRM, or null if none/not connected. */
export async function loadCrmConfig(
  organizationId: string,
  provider: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ config: integration.config, status: integration.status })
    .from(integration)
    .where(
      and(
        eq(integration.organizationId, organizationId),
        eq(integration.provider, provider),
        eq(integration.kind, CRM_KIND),
      ),
    )
    .limit(1)
  if (!row || row.status !== "connected") return null
  return decryptIntegrationConfig(row.config)
}

/** The single connected CRM (provider + decrypted config) for a tenant, or null. MVP: one CRM. */
export async function loadConnectedCrm(
  organizationId: string,
): Promise<{ provider: string; config: Record<string, unknown> } | null> {
  const [row] = await db
    .select({
      provider: integration.provider,
      config: integration.config,
      status: integration.status,
    })
    .from(integration)
    .where(and(eq(integration.organizationId, organizationId), eq(integration.kind, CRM_KIND)))
    .limit(1)
  if (!row || row.status !== "connected") return null
  return { provider: row.provider, config: decryptIntegrationConfig(row.config) }
}

/**
 * Connected, non-paused listing-source integrations, for the scheduled dispatcher to fan out over.
 * Paused integrations stay connected but are skipped until an operator resumes them.
 */
export async function listConnectedListingSources(): Promise<
  Array<{ organizationId: string; provider: string }>
> {
  return db
    .select({ organizationId: integration.organizationId, provider: integration.provider })
    .from(integration)
    .where(
      and(
        eq(integration.kind, LISTING_SOURCE_KIND),
        eq(integration.status, "connected"),
        eq(integration.syncPaused, false),
      ),
    )
}
