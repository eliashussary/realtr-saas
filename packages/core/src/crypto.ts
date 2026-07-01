import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// AES-256-GCM for integration credentials at rest. Key derived from
// INTEGRATION_ENCRYPTION_KEY so any sufficiently long secret works.
function key(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!secret) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set")
  return createHash("sha256").update(secret).digest()
}

/** Encrypt a JSON-serializable value -> "iv.tag.ciphertext" (all base64). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".")
}

/** Reverse of encryptJson. */
export function decryptJson<T = unknown>(payload: string): T {
  const [ivB64, tagB64, dataB64] = payload.split(".")
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed encrypted payload")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString("utf8")) as T
}
