import type { GeoJSONSource, Map as MlMap } from "maplibre-gl"
import { useCallback, useEffect, useRef, useState } from "react"
import "maplibre-gl/dist/maplibre-gl.css"

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"

// A curated area (id + name). The map fetches GeoJSON for the selected ids via the callback the
// parent wires to the db. Client-only (maplibre touches window) — lazy-imported in the effect.
type MappableArea = { id: string; name: string }

function toFeatureCollection(
  polys: Array<{ id: string; name: string; geojson: string }>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: polys.map((p) => ({
      type: "Feature" as const,
      // SAFETY: geojson is a PostGIS ST_AsGeoJSON string for this area's MultiPolygon; JSON.parse
      // yields the geometry object that goes straight into a MapLibre feature.
      geometry: JSON.parse(p.geojson) as GeoJSON.Geometry,
      properties: { id: p.id, name: p.name },
    })),
  }
}

export function AreaMap({
  areas,
  fetchPolygons,
}: {
  areas: MappableArea[]
  fetchPolygons: (ids: string[]) => Promise<Array<{ id: string; name: string; geojson: string }>>
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)

  const loadPolygons = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return null
      const polys = await fetchPolygons(ids)
      return polys.length ? toFeatureCollection(polys) : null
    },
    [fetchPolygons],
  )

  // Init the map exactly once.
  useEffect(() => {
    const el = container.current
    if (!el) return
    let cancelled = false
    void (async () => {
      const maplibre = await import("maplibre-gl")
      if (cancelled || !el) return
      const map = new maplibre.Map({
        container: el,
        style: MAP_STYLE,
        center: [-79.38, 43.65],
        zoom: 5,
      })
      map.on("load", () => {
        if (cancelled) return
        map.addSource("areas", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        })
        map.addLayer({
          id: "areas-fill",
          type: "fill",
          source: "areas",
          paint: { "fill-color": "rgba(22, 119, 255, 0.35)", "fill-opacity": 0.5 },
        })
        map.addLayer({
          id: "areas-line",
          type: "line",
          source: "areas",
          paint: { "line-color": "#1677ff", "line-width": 1.5 },
        })
        mapRef.current = map
        setReady(true)
      })
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Update the polygons + fit bounds whenever the selected set (or readiness) changes.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      const fc = await loadPolygons(areas.map((a) => a.id))
      if (cancelled) return
      const map = mapRef.current
      const src = map?.getSource("areas") as GeoJSONSource | undefined
      if (!map || !src) return
      src.setData(fc ?? { type: "FeatureCollection", features: [] })
      if (fc && fc.features.length > 0) {
        const { LngLatBounds } = await import("maplibre-gl")
        const b = new LngLatBounds()
        for (const f of fc.features) {
          // SAFETY: feature geometry is a Polygon/MultiPolygon from PostGIS; its coordinates are the
          // lng/lat pairs needed to expand the bounds.
          const coords = (f.geometry as GeoJSON.MultiPolygon).coordinates
          for (const poly of coords) {
            for (const ring of poly) {
              for (const c of ring) {
                if (typeof c[0] === "number" && typeof c[1] === "number") b.extend([c[0], c[1]])
              }
            }
          }
        }
        if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 11 })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [areas, ready, loadPolygons])

  return (
    <div className="h-full w-full overflow-hidden rounded-[var(--radius-base)] border border-border">
      <div ref={container} className="h-full w-full" />
    </div>
  )
}
