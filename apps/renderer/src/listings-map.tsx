import type { AreaPolygon, ListingBounds, ListingMarker } from "@realtr/core"
import type { Map as MlMap } from "maplibre-gl"
import { useEffect, useRef } from "react"
import "maplibre-gl/dist/maplibre-gl.css"

// Client-only MapLibre map of the filtered listings. maplibre-gl touches `window`, so it is imported
// lazily inside the effect (never during SSR); the container div renders on the server as a stable
// placeholder and the map initializes on mount. Markers are compact price pills; clicking one opens
// the listing. The map re-fits and re-renders whenever the filtered marker set changes.

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
  notation: "compact",
})

function priceLabel(price: number | null): string {
  return price === null ? "—" : CAD.format(price)
}

// Turn area GeoJSON rows into a FeatureCollection for a MapLibre source. Bad JSON is skipped rather
// than crashing the map.
function areaFeatureCollection(polygons: AreaPolygon[]) {
  const features = polygons.flatMap((p) => {
    try {
      return [
        { type: "Feature" as const, geometry: JSON.parse(p.geojson), properties: { name: p.name } },
      ]
    } catch {
      return []
    }
  })
  return { type: "FeatureCollection" as const, features }
}

export function ListingsMap({
  markers,
  bounds,
  styleUrl,
  areaPolygons,
}: {
  markers: ListingMarker[]
  bounds: ListingBounds | null
  styleUrl: string
  areaPolygons: AreaPolygon[]
}) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = container.current
    if (!el) return
    let map: MlMap | null = null
    let cancelled = false
    const cleanups: Array<() => void> = []

    void (async () => {
      const maplibre = await import("maplibre-gl")
      if (cancelled || !el) return
      map = new maplibre.Map({
        container: el,
        style: styleUrl,
        center: bounds
          ? [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2]
          : [-79.4, 43.7], // fallback: roughly southern Ontario, replaced by fitBounds when we have data
        zoom: 9,
        attributionControl: { compact: true },
      })
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right")

      for (const m of markers) {
        const pill = document.createElement("a")
        pill.href = `/listings/${encodeURIComponent(m.sourceListingId)}`
        pill.textContent = priceLabel(m.listPrice)
        pill.className =
          "cursor-pointer rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 shadow"
        const marker = new maplibre.Marker({ element: pill }).setLngLat([m.longitude, m.latitude])
        if (map) marker.addTo(map)
        cleanups.push(() => marker.remove())
      }

      // Outline the selected neighbourhood(s). Sources/layers require the style to be loaded first.
      if (areaPolygons.length > 0) {
        const collection = areaFeatureCollection(areaPolygons)
        const draw = () => {
          if (!map || map.getSource("areas")) return
          map.addSource("areas", { type: "geojson", data: collection })
          map.addLayer({
            id: "areas-fill",
            type: "fill",
            source: "areas",
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 },
          })
          map.addLayer({
            id: "areas-line",
            type: "line",
            source: "areas",
            paint: { "line-color": "#2563eb", "line-width": 2 },
          })
        }
        if (map.isStyleLoaded()) draw()
        else map.once("load", draw)
      }

      if (bounds) {
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 48, maxZoom: 15, duration: 0 },
        )
      }

      // The map may initialize inside a hidden (mobile "list" view) pane with zero size; resize it
      // whenever the container gains dimensions so it paints correctly once shown.
      const ro = new ResizeObserver(() => map?.resize())
      ro.observe(el)
      cleanups.push(() => ro.disconnect())
    })()

    return () => {
      cancelled = true
      for (const c of cleanups) c()
      map?.remove()
    }
  }, [markers, bounds, styleUrl, areaPolygons])

  if (markers.length === 0) {
    return (
      <div className="flex h-full min-h-72 w-full items-center justify-center rounded-lg border border-border bg-muted/10 text-sm text-muted">
        No mapped listings for this search.
      </div>
    )
  }
  return <div ref={container} className="h-full min-h-72 w-full rounded-lg" />
}
