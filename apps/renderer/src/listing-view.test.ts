import { describe, expect, it } from "vitest"
import { toListingView } from "./listing-view"

describe("toListingView", () => {
  it("formats price, address, facts, and photos", () => {
    const view = toListingView({
      listPrice: 899000,
      address: { unparsed: "123 Fake St", city: "Testville", province: "ON" },
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1800,
      livingAreaUnits: "sqft",
      propertyType: "Detached",
      publicRemarks: "Lovely.",
      brokerageName: "Synthetic Brokerage Inc.",
      media: [
        { url: "https://media.invalid/1.jpg" },
        { url: "not-a-url" },
        { url: "https://media.invalid/2.jpg" },
      ],
    })

    expect(view.price).toContain("899,000")
    expect(view.addressLine).toBe("123 Fake St")
    expect(view.cityProvince).toBe("Testville, ON")
    expect(view.beds).toBe(3)
    expect(view.baths).toBe(2)
    expect(view.area).toBe("1800 sqft")
    expect(view.brokerageName).toBe("Synthetic Brokerage Inc.")
    expect(view.photos).toEqual(["https://media.invalid/1.jpg", "https://media.invalid/2.jpg"])
    expect(view.primaryPhoto).toBe("https://media.invalid/1.jpg")
  })

  it("tolerates missing and malformed fields", () => {
    const view = toListingView({})
    expect(view).toMatchObject({
      price: null,
      priceValue: null,
      addressLine: null,
      cityProvince: null,
      beds: null,
      baths: null,
      area: null,
      brokerageName: null,
      photos: [],
      primaryPhoto: null,
    })
  })

  it("falls back to a single city or province", () => {
    expect(toListingView({ address: { city: "Testville" } }).cityProvince).toBe("Testville")
    expect(toListingView({ address: { province: "ON" } }).cityProvince).toBe("ON")
  })
})
