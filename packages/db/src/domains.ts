import { eq, inArray } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { domain } from "./schema"

// States the background job keeps trying to advance toward `verified`. `active`/`verified` are left
// alone (no auto-downgrade — avoids flapping a working domain on a transient DNS blip); `detached` is
// terminal.
const VERIFIABLE_STATES = ["pending", "verifying", "error"] as const

export type DomainDatabase = NodePgDatabase<typeof schema>

export interface DomainRow {
  id: string
  hostname: string
  status: string
  verificationToken: string
}

/**
 * Domain repository implementing the @realtr/core verification service's port (structurally). Uses
 * the existing `domain` table's free-text `status` column — no schema change — so `status` carries
 * the DomainState lifecycle values.
 */
export function createDomainRepository(database: DomainDatabase) {
  return {
    async getDomain(domainId: string): Promise<DomainRow | null> {
      const [row] = await database
        .select({
          id: domain.id,
          hostname: domain.hostname,
          status: domain.status,
          verificationToken: domain.verificationToken,
        })
        .from(domain)
        .where(eq(domain.id, domainId))
        .limit(1)
      return row ?? null
    },

    async findByHostname(hostname: string): Promise<{ id: string; status: string } | null> {
      const [row] = await database
        .select({ id: domain.id, status: domain.status })
        .from(domain)
        .where(eq(domain.hostname, hostname))
        .limit(1)
      return row ?? null
    },

    async setStatus(domainId: string, status: string): Promise<void> {
      await database
        .update(domain)
        .set({ status, updatedAt: new Date() })
        .where(eq(domain.id, domainId))
    },
  }
}

export type DomainRepository = ReturnType<typeof createDomainRepository>

/** Domains the scheduled re-verification job should attempt (pending/verifying/error). */
export async function listDomainsAwaitingVerification(
  database: DomainDatabase,
): Promise<Array<{ id: string }>> {
  return database
    .select({ id: domain.id })
    .from(domain)
    .where(inArray(domain.status, [...VERIFIABLE_STATES]))
}
