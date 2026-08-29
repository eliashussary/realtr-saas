import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

// Object store for uploaded bytes. One implementation — S3-compatible via the official AWS SDK —
// used in every environment: SeaweedFS locally, any S3-compatible endpoint (AWS S3, Cloudflare R2,
// Backblaze B2, Wasabi, …) in prod. Objects are served directly from the store's public URL.
export interface AssetStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
}

/** Map a content type to a safe file extension; null when unsupported. */
export function extensionForContentType(contentType: string): string | null {
  const found = Object.entries(EXT_CONTENT_TYPE).find(([, ct]) => ct === contentType)
  return found ? found[0] : null
}

export interface S3StoreOptions {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  publicBase: string // public URL prefix objects are served from (bucket URL or a CDN)
  createBucket: boolean // dev convenience; leave false in prod where the bucket is pre-provisioned
}

export class S3AssetStore implements AssetStore {
  private readonly client: S3Client
  private bucketReady?: Promise<void>

  constructor(private readonly opts: S3StoreOptions) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      forcePathStyle: true, // path-style works across every S3-compatible provider
    })
  }

  private ensureBucket(): Promise<void> {
    if (!this.opts.createBucket) return Promise.resolve()
    // Create once per process; treat "already exists" as success.
    this.bucketReady ??= this.client
      .send(new CreateBucketCommand({ Bucket: this.opts.bucket }))
      .then(() => undefined)
      .catch((err: { name?: string }) => {
        const name = err?.name ?? ""
        if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") return
        throw err
      })
    return this.bucketReady
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.ensureBucket()
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    )
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }))
  }

  publicUrl(key: string): string {
    return `${this.opts.publicBase.replace(/\/$/, "")}/${key}`
  }
}

let cached: AssetStore | null = null

/**
 * The configured asset store. Dev defaults target the SeaweedFS from docker-compose.dev.yml; prod
 * sets ASSET_S3_* (and ASSET_PUBLIC_BASE for a CDN) to any S3-compatible endpoint.
 */
export function getAssetStore(): AssetStore {
  if (cached) return cached
  const endpoint = process.env.ASSET_S3_ENDPOINT ?? "http://localhost:9002"
  const bucket = process.env.ASSET_S3_BUCKET ?? "realtr-assets"
  // Auto-create the bucket only for local endpoints (dev); prod buckets are pre-provisioned.
  const createBucket =
    process.env.ASSET_S3_CREATE_BUCKET === "true" ||
    (process.env.ASSET_S3_CREATE_BUCKET !== "false" && /localhost|127\.0\.0\.1/.test(endpoint))
  cached = new S3AssetStore({
    endpoint,
    bucket,
    region: process.env.ASSET_S3_REGION ?? "us-east-1",
    accessKeyId: process.env.ASSET_S3_ACCESS_KEY_ID ?? "realtr",
    secretAccessKey: process.env.ASSET_S3_SECRET_ACCESS_KEY ?? "realtr-dev-secret",
    publicBase: process.env.ASSET_PUBLIC_BASE ?? `${endpoint}/${bucket}`,
    createBucket,
  })
  return cached
}
