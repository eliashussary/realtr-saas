import { randomUUID } from "node:crypto"
import { db } from "@realtr/db"
import { type AssetRecord, createAsset, deleteAsset, getAsset, listAssets } from "@realtr/db/assets"
import { extensionForContentType, getAssetStore } from "./store"

export type { AssetRecord }

// Allowed image uploads. SVG is intentionally excluded — it can carry scripts and would be an XSS
// vector when served on tenant sites.
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
export const MAX_ASSET_BYTES = 8 * 1024 * 1024 // 8MB

export type UploadResult =
  | { ok: true; asset: AssetRecord }
  | { ok: false; code: "unsupported_type" | "too_large" | "empty" }

export interface UploadInput {
  organizationId: string
  createdByMemberId?: string | null
  contentType: string
  bytes: Uint8Array
  originalFilename?: string | null
}

/** Validate, store the bytes, and persist an asset row. Tenant-scoped by `organizationId`. */
export async function storeUploadedImage(input: UploadInput): Promise<UploadResult> {
  if (input.bytes.byteLength === 0) return { ok: false, code: "empty" }
  if (input.bytes.byteLength > MAX_ASSET_BYTES) return { ok: false, code: "too_large" }
  if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) return { ok: false, code: "unsupported_type" }
  const ext = extensionForContentType(input.contentType)
  if (!ext) return { ok: false, code: "unsupported_type" }

  const store = getAssetStore()
  const key = `${input.organizationId}/${randomUUID()}.${ext}`
  await store.put(key, input.bytes, input.contentType)

  const asset = await createAsset(db, {
    organizationId: input.organizationId,
    createdByMemberId: input.createdByMemberId,
    kind: "image",
    contentType: input.contentType,
    byteSize: input.bytes.byteLength,
    storageKey: key,
    url: store.publicUrl(key),
    originalFilename: input.originalFilename,
  })
  return { ok: true, asset }
}

/** Delete an asset's row and its bytes. Tenant-scoped. */
export async function deleteStoredAsset(organizationId: string, id: string): Promise<boolean> {
  const removed = await deleteAsset(db, organizationId, id)
  if (!removed) return false
  await getAssetStore().delete(removed.storageKey)
  return true
}

export function listTenantAssets(
  organizationId: string,
  options: { kind?: string; limit?: number } = {},
): Promise<AssetRecord[]> {
  return listAssets(db, organizationId, options)
}

export function getTenantAsset(organizationId: string, id: string): Promise<AssetRecord | null> {
  return getAsset(db, organizationId, id)
}
