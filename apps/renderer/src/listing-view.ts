// Turn a stored listing's opaque `data` (normalized by @realtr/core's DDF source) into a typed,
// display-ready view model. Every field is optional at the source, so each accessor is defensive.

export interface ListingView {
  priceValue: number | null
  price: string | null
  addressLine: string | null
  cityProvince: string | null
  beds: number | null
  baths: number | null
  area: string | null
  propertyType: string | null
  remarks: string | null
  brokerageName: string | null
  photos: string[]
  primaryPhoto: string | null
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

const priceFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
})

function photos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => str(record(item).url))
    .filter((url): url is string => url !== undefined && /^https?:\/\//i.test(url))
}

export function toListingView(data: Record<string, unknown>): ListingView {
  const address = record(data.address)
  const priceValue = num(data.listPrice) ?? null
  const city = str(address.city)
  const province = str(address.province)
  const areaValue = num(data.livingArea)
  const areaUnits = str(data.livingAreaUnits) ?? "sqft"
  const list = photos(data.media)

  return {
    priceValue,
    price: priceValue !== null ? priceFormatter.format(priceValue) : null,
    addressLine: str(address.unparsed) ?? null,
    cityProvince: city && province ? `${city}, ${province}` : (city ?? province ?? null),
    beds: num(data.bedrooms) ?? null,
    baths: num(data.bathrooms) ?? null,
    area: areaValue !== undefined ? `${areaValue} ${areaUnits}` : null,
    propertyType: str(data.propertyType) ?? null,
    remarks: str(data.publicRemarks) ?? null,
    brokerageName: str(data.brokerageName) ?? null,
    photos: list,
    primaryPhoto: list[0] ?? null,
  }
}
