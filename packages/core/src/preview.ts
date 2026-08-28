import { createHash } from "node:crypto"
import { db } from "@realtr/db"
import { createSiteDocumentRepository } from "@realtr/db/site-documents"

/**
 * Resolve a raw preview token to its immutable revision document for public rendering. Hashing and
 * the expiry/revocation checks live in the repository; a missing/expired/revoked token yields null
 * so the caller returns a generic 404. Returns the raw document; the renderer interprets it.
 */
export async function resolvePreview(rawToken: string): Promise<Record<string, unknown> | null> {
  if (!rawToken) return null
  const tokenHash = createHash("sha256").update(rawToken).digest()
  const repository = createSiteDocumentRepository(db)
  const resolved = await repository.resolvePreviewGrant(tokenHash, new Date())
  return resolved?.document ?? null
}
