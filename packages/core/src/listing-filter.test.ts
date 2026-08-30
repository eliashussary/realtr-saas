import { describe, expect, it } from "vitest"
import {
  type ListingFilter,
  isEmptyListingFilter,
  listingFilterToQueryString,
  listingFilterToSearchParams,
  parseListingFilter,
} from "./listing-filter"

describe("parseListingFilter", () => {
  it("reads scalar and repeated-key values", () => {
    const params = new URLSearchParams(
      "minPrice=250000&maxPrice=900000&minBeds=3&minBaths=2&propertyType=House&propertyType=Condo&city=Ottawa&sort=price_asc",
    )
    expect(parseListingFilter(params)).toEqual<ListingFilter>({
      minPrice: 250000,
      maxPrice: 900000,
      minBeds: 3,
      minBaths: 2,
      propertyType: ["House", "Condo"],
      city: ["Ottawa"],
      sort: "price_asc",
    })
  })

  it("drops malformed numbers, blanks, duplicates, and unknown sorts", () => {
    const params = new URLSearchParams(
      "minPrice=abc&minBeds=-1&city=Ottawa&city=Ottawa&city=&propertyType=%20&sort=cheapest",
    )
    expect(parseListingFilter(params)).toEqual<ListingFilter>({ city: ["Ottawa"] })
  })

  it("treats empty number inputs (GET form) as absent, not zero", () => {
    const params = new URLSearchParams("minPrice=&maxPrice=&minBeds=&propertyType=House")
    expect(parseListingFilter(params)).toEqual<ListingFilter>({ propertyType: ["House"] })
  })

  it("returns an empty filter for empty params", () => {
    const filter = parseListingFilter(new URLSearchParams())
    expect(filter).toEqual({})
    expect(isEmptyListingFilter(filter)).toBe(true)
  })
})

describe("listingFilterToSearchParams", () => {
  it("omits undefined and empty arrays, repeats array keys", () => {
    const params = listingFilterToSearchParams({
      minPrice: 250000,
      propertyType: ["House", "Condo"],
      city: [],
      sort: "newest",
    })
    expect(params.getAll("propertyType")).toEqual(["House", "Condo"])
    expect(params.get("minPrice")).toBe("250000")
    expect(params.has("maxPrice")).toBe(false)
    expect(params.has("city")).toBe(false)
    expect(params.get("sort")).toBe("newest")
  })
})

describe("round-trip", () => {
  it("parse(serialize(x)) === x for a full filter", () => {
    const filter: ListingFilter = {
      minPrice: 100000,
      maxPrice: 500000,
      minBeds: 2,
      minBaths: 1,
      propertyType: ["Townhouse"],
      city: ["Ottawa", "Kanata"],
      areaIds: ["ottawa_barrhaven"],
      sort: "price_desc",
    }
    expect(parseListingFilter(listingFilterToSearchParams(filter))).toEqual(filter)
  })

  it("queryString is stable regardless of key insertion order", () => {
    const a = listingFilterToQueryString({ sort: "newest", minPrice: 100000, city: ["Ottawa"] })
    const b = listingFilterToQueryString({ city: ["Ottawa"], minPrice: 100000, sort: "newest" })
    expect(a).toBe(b)
  })
})

describe("isEmptyListingFilter", () => {
  it("treats a sort-only filter as empty", () => {
    expect(isEmptyListingFilter({ sort: "price_asc" })).toBe(true)
  })
  it("is false when any narrowing dimension is set", () => {
    expect(isEmptyListingFilter({ minBeds: 1 })).toBe(false)
    expect(isEmptyListingFilter({ city: ["Ottawa"] })).toBe(false)
    expect(isEmptyListingFilter({ areaIds: ["x"] })).toBe(false)
  })
})
