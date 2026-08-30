import { customType } from "drizzle-orm/pg-core"

// A PostGIS geometry column (always SRID 4326 / WGS84). drizzle has no native spatial type, so this
// customType renders the right DDL and lets drizzle-kit manage the column. Values are read/written as
// GeoJSON/WKT via PostGIS functions (ST_GeomFromGeoJSON / ST_AsGeoJSON) at the query layer, so the
// TS-facing type is just a string; callers rarely select the raw geometry.
export const geometry = customType<{ data: string; driverData: string; config: { type: string } }>({
  dataType(config) {
    return `geometry(${config?.type ?? "Geometry"},4326)`
  },
})
