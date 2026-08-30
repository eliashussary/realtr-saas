// OpenFreeMap: no API key, no quota, commercial use allowed — the same default the single-tenant app
// uses. A tenant/deployment can override with MAP_STYLE_LIGHT (read server-side, passed to the client
// map). MapTiler and a dark style can be layered in later behind the same seam.
const OPENFREEMAP_LIGHT_STYLE = "https://tiles.openfreemap.org/styles/liberty"

/** The basemap style URL for the public listings map. Read at request time so env overrides apply. */
export function listingMapStyleUrl(): string {
  const override = process.env.MAP_STYLE_LIGHT?.trim()
  return override && override.length > 0 ? override : OPENFREEMAP_LIGHT_STYLE
}
