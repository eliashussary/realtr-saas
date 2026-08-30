import { Button } from "@realtr/ui/components/button"
import type { Map as MlMap } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import "maplibre-gl/dist/maplibre-gl.css"

// OpenFreeMap — no key/quota, same default the public sites use.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty"

export interface Bbox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

function bboxPolygon(b: Bbox) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [b.minLng, b.minLat],
          [b.maxLng, b.minLat],
          [b.maxLng, b.maxLat],
          [b.minLng, b.maxLat],
          [b.minLng, b.minLat],
        ],
      ],
    },
    properties: {},
  }
}

/**
 * A MapLibre editor for the service-area box: pan/zoom to the market, then "Use current map view" to
 * capture the viewport as the box. The saved box is outlined; capturing re-fits with padding so it
 * stays visible. Client-only (maplibre touches window) — lazy-imported in the effect.
 */
export function ServiceAreaMap({
  bbox,
  onCapture,
}: {
  bbox: Bbox | null
  onCapture: (bbox: Bbox) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)

  // Initialize the map exactly once; the box is drawn/fit by the effect below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: init once, not on every bbox change
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
        center: bbox
          ? [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2]
          : [-96, 56],
        zoom: bbox ? 8 : 3,
        attributionControl: { compact: true },
      })
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right")
      map.on("load", () => {
        if (cancelled) return
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

  // Draw / update the box outline and fit to it whenever it changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const data = bbox
      ? { type: "FeatureCollection" as const, features: [bboxPolygon(bbox)] }
      : { type: "FeatureCollection" as const, features: [] }
    const existing = map.getSource("service-area") as { setData?: (d: unknown) => void } | undefined
    if (existing?.setData) {
      existing.setData(data)
    } else {
      map.addSource("service-area", { type: "geojson", data })
      map.addLayer({
        id: "service-area-fill",
        type: "fill",
        source: "service-area",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.1 },
      })
      map.addLayer({
        id: "service-area-line",
        type: "line",
        source: "service-area",
        paint: { "line-color": "#2563eb", "line-width": 2 },
      })
    }
    if (bbox) {
      map.fitBounds(
        [
          [bbox.minLng, bbox.minLat],
          [bbox.maxLng, bbox.maxLat],
        ],
        { padding: 60, maxZoom: 14, duration: 0 },
      )
    }
  }, [ready, bbox])

  function capture() {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    onCapture({
      minLng: b.getWest(),
      minLat: b.getSouth(),
      maxLng: b.getEast(),
      maxLat: b.getNorth(),
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={container}
        className="h-96 w-full overflow-hidden rounded-[var(--radius-base)] border border-border"
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={capture} disabled={!ready}>
          Use current map view
        </Button>
        <span className="text-sm text-muted-foreground">
          Pan and zoom to your market, then capture the view as your service area.
        </span>
      </div>
    </div>
  )
}
