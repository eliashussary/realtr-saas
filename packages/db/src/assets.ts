import { and, desc, eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "./schema"
import { asset } from "./schema"

export type AssetDatabase = NodePgDatabase<typeof schema>

export interface AssetRecord {
  id: string
  organizationId: string
  kind: string
  contentType: string
  byteSize: number
  storageKey: string
  url: string
  originalFilename: string | null
  createdAt: string
}

export interface CreateAssetInput {
  organizationId: string
  createdByMemberId?: string | null
  kind?: string
  contentType: string
  byteSize: number
  storageKey: string
  url: string
  originalFilename?: string | null
}

function toRecord(row: typeof asset.$inferSelect): AssetRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind,
    contentType: row.contentType,
    byteSize: row.byteSize,
    storageKey: row.storageKey,
    url: row.url,
    originalFilename: row.originalFilename,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function createAsset(
  database: AssetDatabase,
  input: CreateAssetInput,
): Promise<AssetRecord> {
  const [row] = await database
    .insert(asset)
    .values({
      organizationId: input.organizationId,
      createdByMemberId: input.createdByMemberId ?? null,
      kind: input.kind ?? "image",
      contentType: input.contentType,
      byteSize: input.byteSize,
      storageKey: input.storageKey,
      url: input.url,
      originalFilename: input.originalFilename ?? null,
    })
    .returning()
  if (!row) throw new Error("Failed to create asset")
  return toRecord(row)
}

export async function getAsset(
  database: AssetDatabase,
  organizationId: string,
  id: string,
): Promise<AssetRecord | null> {
  const [row] = await database
    .select()
    .from(asset)
    .where(and(eq(asset.organizationId, organizationId), eq(asset.id, id)))
    .limit(1)
  return row ? toRecord(row) : null
}

/** A tenant's media library, newest first. */
export async function listAssets(
  database: AssetDatabase,
  organizationId: string,
  options: { kind?: string; limit?: number } = {},
): Promise<AssetRecord[]> {
  const conditions = [eq(asset.organizationId, organizationId)]
  if (options.kind) conditions.push(eq(asset.kind, options.kind))
  const rows = await database
    .select()
    .from(asset)
    .where(and(...conditions))
    .orderBy(desc(asset.createdAt))
    .limit(options.limit ?? 200)
  return rows.map(toRecord)
}

/** Delete an asset row (tenant-scoped). Returns the removed record so the caller can delete bytes. */
export async function deleteAsset(
  database: AssetDatabase,
  organizationId: string,
  id: string,
): Promise<AssetRecord | null> {
  const [row] = await database
    .delete(asset)
    .where(and(eq(asset.organizationId, organizationId), eq(asset.id, id)))
    .returning()
  return row ? toRecord(row) : null
}
