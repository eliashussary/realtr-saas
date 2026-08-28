import { type BoundingBox, DdfClient, type DdfProperty } from "@realtr/ddf"
import { z } from "zod"
import type { ListingSource, NormalizedListing, SourceContext, SyncResult } from "./types"

// DDF (REALTOR.ca) listing source — RESO Web API (OData) via @realtr/ddf. Onboarding is a
// Technology-Provider authorization/linking model (see the M3-D1 brief), so config carries issued
// API credentials, never a member's DDF password.
const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  host: z.string().url().optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
})

function clientFor(ctx: SourceContext): { client: DdfClient; bbox?: BoundingBox } {
  const config = configSchema.parse(ctx.config)
  return {
    client: new DdfClient({ host: config.host }),
    bbox: config.bbox,
  }
}

/** Map a raw DDF Property to Realtr's normalized display shape (only fields we render). */
export function normalizeDdfProperty(property: DdfProperty): NormalizedListing {
  const media = (property.Media ?? [])
    .filter((item) => typeof item.MediaURL === "string")
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))
    .map((item) => ({
      url: item.MediaURL,
      order: item.Order,
      preferred: item.PreferredPhotoYN,
      modifiedAt: item.ModificationTimestamp,
    }))

  return {
    sourceListingId: property.ListingId ?? property.ListingKey,
    sourceKey: property.ListingKey,
    status: "active",
    sourceModifiedAt: property.ModificationTimestamp,
    data: {
      status: property.StandardStatus,
      listPrice: property.ListPrice,
      propertyType: property.PropertyType ?? property.PropertySubType,
      bedrooms: property.BedroomsTotal,
      bathrooms: property.BathroomsTotalInteger,
      livingArea: property.LivingArea,
      livingAreaUnits: property.LivingAreaUnits,
      yearBuilt: property.YearBuilt,
      publicRemarks: property.PublicRemarks,
      address: {
        unparsed: property.UnparsedAddress,
        city: property.City,
        province: property.StateOrProvince,
        postalCode: property.PostalCode,
        country: property.Country,
      },
      latitude: property.Latitude,
      longitude: property.Longitude,
      // Attribution is a display requirement, not optional content (DDF rules §6).
      brokerageName: property.ListOfficeName,
      media,
    },
  }
}

function latestTimestamp(listings: NormalizedListing[]): string | undefined {
  let latest: string | undefined
  for (const listing of listings) {
    if (listing.sourceModifiedAt && (!latest || listing.sourceModifiedAt > latest)) {
      latest = listing.sourceModifiedAt
    }
  }
  return latest
}

export const ddfSource: ListingSource = {
  provider: "ddf",

  async verify(ctx: SourceContext): Promise<void> {
    const config = configSchema.parse(ctx.config)
    const { client } = clientFor(ctx)
    await client.authenticate(config.clientId, config.clientSecret)
  },

  async sync(ctx: SourceContext): Promise<SyncResult> {
    const config = configSchema.parse(ctx.config)
    const { client, bbox } = clientFor(ctx)
    await client.authenticate(config.clientId, config.clientSecret)
    const since = ctx.since ? new Date(ctx.since) : undefined
    const properties = await client.collectProperties({ since, bbox })
    const upserts = properties.map(normalizeDdfProperty)
    return { upserts, checkpoint: latestTimestamp(upserts) ?? ctx.since }
  },

  async listEntitlement(ctx: SourceContext): Promise<string[]> {
    const config = configSchema.parse(ctx.config)
    const { client } = clientFor(ctx)
    await client.authenticate(config.clientId, config.clientSecret)
    const rows = await client.collectReplication()
    return rows.map((row) => row.ListingKey)
  },
}
