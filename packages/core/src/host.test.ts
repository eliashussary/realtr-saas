import { describe, expect, it } from "vitest"
import { normalizeHost } from "./host"

describe("normalizeHost", () => {
  it.each([
    ["Example.COM", "example.com"],
    ["demo.localhost:3000", "demo.localhost"],
    ["  Demo.LocalHost:3000  ", "demo.localhost"],
    ["localhost", "localhost"],
    ["", ""],
    ["   ", ""],
    [":3000", ""],
    ["example.com:not-a-port", "example.com"],
  ])("normalizes %j as %j", (input, expected) => {
    expect(normalizeHost(input)).toBe(expected)
  })
})
