// RESO Web API (OData) shapes for the REALTOR.ca DDF feed. Reference: the single-tenant
// libs/reso-client in the realtr repo and the public DDF API docs. We type only the fields Realtr
// currently consumes for display and sync (data minimization — see the M3-D1 discovery brief); the
// raw record may carry many more, so consumers should treat unknown fields as opaque.

/** Standard OData collection envelope. `@odata.nextLink` is the pagination continuation authority. */
export interface ODataResponse<T> {
  "@odata.context"?: string
  "@odata.nextLink"?: string | null
  value: T[]
}

export interface DdfMedia {
  MediaKey?: string
  MediaURL?: string
  /** Detect photo changes via this rather than MediaKey (per DDF 2026-05-07 release note). */
  ModificationTimestamp?: string
  Order?: number
  PreferredPhotoYN?: boolean
  MediaCategory?: string
  ShortDescription?: string
  LongDescription?: string
}

export interface DdfRoom {
  RoomKey?: string
  RoomType?: string
  RoomLevel?: string
  RoomDimensions?: string
}

/**
 * A DDF Property record. Only the identity, status, price, core facts, address/geo, attribution,
 * media, and timestamp fields are typed; everything else stays opaque under the index signature.
 */
export interface DdfProperty {
  ListingKey: string
  ListingId?: string
  ModificationTimestamp?: string
  StandardStatus?: string
  ListPrice?: number

  PublicRemarks?: string
  PropertyType?: string
  PropertySubType?: string
  BedroomsTotal?: number
  BathroomsTotalInteger?: number
  LivingArea?: number
  LivingAreaUnits?: string
  YearBuilt?: number

  UnparsedAddress?: string
  StreetNumber?: string
  StreetName?: string
  City?: string
  StateOrProvince?: string
  PostalCode?: string
  Country?: string
  Latitude?: number
  Longitude?: number

  ListOfficeName?: string
  ListAgentKey?: string
  ListOfficeKey?: string

  Media?: DdfMedia[]
  Rooms?: DdfRoom[]

  [key: string]: unknown
}

/** Lightweight replication row: resource key + last-modified. Used to reconcile the master list. */
export interface DdfReplicationRow {
  ListingKey: string
  ModificationTimestamp?: string
}

export type DdfPropertyResponse = ODataResponse<DdfProperty>
export type DdfReplicationResponse = ODataResponse<DdfReplicationRow>
