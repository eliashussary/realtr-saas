import { describe, expect, it } from "vitest"
import { S3AssetStore, extensionForContentType } from "./store"

describe("extensionForContentType", () => {
  it("maps supported image types and rejects others", () => {
    expect(extensionForContentType("image/jpeg")).toBe("jpg")
    expect(extensionForContentType("image/png")).toBe("png")
    expect(extensionForContentType("image/webp")).toBe("webp")
    expect(extensionForContentType("application/pdf")).toBeNull()
    expect(extensionForContentType("image/svg+xml")).toBeNull()
  })
})

describe("S3AssetStore.publicUrl", () => {
  const store = new S3AssetStore({
    endpoint: "http://localhost:9002",
    bucket: "realtr-assets",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
    publicBase: "https://cdn.example.com/",
    createBucket: false,
  })

  it("joins the public base and key, normalizing a trailing slash", () => {
    expect(store.publicUrl("org-1/photo.png")).toBe("https://cdn.example.com/org-1/photo.png")
  })
})
