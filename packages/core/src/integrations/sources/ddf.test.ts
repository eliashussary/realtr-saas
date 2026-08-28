import type { DdfProperty } from "@realtr/ddf"
import { describe, expect, it } from "vitest"
import { normalizeDdfProperty } from "./ddf"

const raw: DdfProperty = {
  ListingKey: "KEY-1",
  ListingId: "MLS-1",
  ModificationTimestamp: "2026-03-01T12:00:00.000Z",
  StandardStatus: "Active",
  ListPrice: 750000,
  PropertySubType: "Detached",
  BedroomsTotal: 4,
  BathroomsTotalInteger: 3,
  UnparsedAddress: "123 Fake St, Testville",
  City: "Testville",
  StateOrProvince: "ON",
  ListOfficeName: "Synthetic Brokerage Inc.",
  Media: [
    { MediaURL: "https://media.invalid/2.jpg", Order: 2 },
    { MediaURL: "https://media.invalid/1.jpg", Order: 1, PreferredPhotoYN: true },
    { Order: 3 }, // no URL -> dropped
  ],
}

describe("normalizeDdfProperty", () => {
  it("maps identity, price, address, and attribution", () => {
    const listing = normalizeDdfProperty(raw)
    expect(listing.sourceKey).toBe("KEY-1")
    expect(listing.sourceListingId).toBe("MLS-1")
    expect(listing.status).toBe("active")
    expect(listing.sourceModifiedAt).toBe("2026-03-01T12:00:00.000Z")
    expect(listing.data.listPrice).toBe(750000)
    expect(listing.data.brokerageName).toBe("Synthetic Brokerage Inc.")
    expect((listing.data.address as Record<string, unknown>).city).toBe("Testville")
  })

  it("sorts media by order and drops entries without a URL", () => {
    const media = normalizeDdfProperty(raw).data.media as Array<{ url?: string }>
    expect(media.map((m) => m.url)).toEqual([
      "https://media.invalid/1.jpg",
      "https://media.invalid/2.jpg",
    ])
  })

  it("falls back to the resource key when ListingId is absent", () => {
    const { ListingId, ...rest } = raw
    expect(normalizeDdfProperty(rest).sourceListingId).toBe("KEY-1")
  })
})
