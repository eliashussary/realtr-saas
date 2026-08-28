import { and, db, eq, integration } from "@realtr/db"
import { decryptJson, encryptJson } from "../crypto"

// Integration config storage + retrieval. Credentials are encrypted at the app layer
// (INTEGRATION_ENCRYPTION_KEY) and stored in `integration.config` as `{ enc: "<payload>" }`. The
// connect UI (M3-A6a) writes them with `encryptIntegrationConfig`; the worker reads them with
// `loadListingSourceConfig`.

export const LISTING_SOURCE_KIND = "listing_source"

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
