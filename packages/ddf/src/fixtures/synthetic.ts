// SYNTHETIC DDF fixtures — hand-authored from the public schema. No real listings, addresses,
// keys, or credentials. URLs use the reserved `.invalid`/`.test` domains. Safe to commit and to use
// for offline provider contract tests until CREA-approved sanitized captures are available.

import type { DdfProperty, DdfReplicationRow } from "../types"

export const SYNTHETIC = true
export const HOST = "https://ddf.test"
export const TOKEN_ENDPOINT = "https://id.test/connect/token"

export const tokenBody = {
  access_token: "synthetic-access-token",
  token_type: "Bearer",
  expires_in: 3600,
}

export function property(key: string, over: Partial<DdfProperty> = {}): DdfProperty {
  return {
    ListingKey: key,
    ListingId: `ID-${key}`,
    ModificationTimestamp: "2026-01-01T00:00:00.000Z",
    StandardStatus: "Active",
    ListPrice: 500000,
    City: "Testville",
    StateOrProvince: "ON",
    Country: "Canada",
    UnparsedAddress: `${key} Nowhere Street, Testville`,
    ListOfficeName: "Synthetic Brokerage Inc.",
    Media: [{ MediaURL: `https://media.invalid/${key}-1.jpg`, Order: 1, PreferredPhotoYN: true }],
    ...over,
  }
}

export function replicationRow(key: string, ts = "2026-01-01T00:00:00.000Z"): DdfReplicationRow {
  return { ListingKey: key, ModificationTimestamp: ts }
}
