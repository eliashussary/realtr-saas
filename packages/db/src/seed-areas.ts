import { readFileSync, readdirSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config } from "dotenv"
import { type AreaFeatureInput, loadAreas } from "../src/areas"

// Load root .env before importing the client (which reads DATABASE_URL at import).
config({ path: "../../.env" })
const { db, pool } = await import("../src/client")

// A market descriptor — the data-driven seam that lets "add a market" be a GeoJSON + a small JSON,
// never a code change. See data/areas/datasets/*.json. Hierarchy mapping is per-field:
//   null                      -> leave the column null (flat market, e.g. Ottawa)
//   { type: "path", index: n } -> segment n (0-based) of the feature id, split on "_"
//   { type: "prop", key: k }   -> feature.properties[k]
type Seg = { type: "path"; index: number } | { type: "prop"; key: string }
interface Hierarchy {
  // Feature type that is a filterable area; null = keep every feature (flat markets).
  areaType?: string | null
  parentRegion: null | Seg
  region: null | Seg
}
interface DatasetDescriptor {
  market: string
  file: string
  sourceName: string
  // The feature id must match this, or the loader fails loudly (guards against a wrong-shaped
  // dataset being mis-grouped into the wrong market).
  idPattern?: string | null
  // How to build the stable `area.id`: which feature property carries the base value, plus an
  // optional prefix. name-sourced ids are kebab-cased (Ottawa "3001" -> "ottawa_airport").
  idSource?: "id" | "name"
  idPrefix?: string | null
  hierarchy: Hierarchy
}

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, "..", "data", "areas")

function segValue(segs: string[], seg: Seg): string | null {
  if (seg.type === "path") {
    // Negative index counts from the END so a variable-depth path (4-seg vs 5-seg) maps the same way:
    // region = -2 (city), parentRegion = -3 (region) regardless of whether a district level sits between.
    const i = seg.index < 0 ? segs.length + seg.index : seg.index
    const v = segs[i]
    return v === undefined || v === "" ? null : v
  }
  return null // "prop" is handled against properties below
}

function segmentFrom(
  seg: null | Seg,
  segs: string[],
  props: Record<string, unknown>,
): string | null {
  if (seg === null) return null
  if (seg.type === "path") return segValue(segs, seg)
  const v = props[seg.key]
  return typeof v === "string" && v !== "" ? v : null
}

function kebab(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Derive the area columns for one GeoJSON feature from the dataset descriptor. Returns null when the
 * feature's type is not a filterable area (e.g. a locality/parent in the Toronto file). Throws when
 * an id doesn't match the dataset's expected shape — a wrong-shaped row is a data bug, not something
 * to silently mis-group.
 */
function toFeature(
  market: string,
  descriptor: DatasetDescriptor,
  feature: { properties: Record<string, unknown>; geometry: unknown },
): AreaFeatureInput | null {
  const props = feature.properties ?? {}
  const name = typeof props.name === "string" ? props.name : null
  if (!name) throw new Error(`[${market}] feature missing string properties.name`)
  const geometry = feature.geometry as { type: string; coordinates: unknown } | undefined
  if (!geometry) throw new Error(`[${market}] feature ${name} missing geometry`)

  const { areaType, parentRegion, region } = descriptor.hierarchy
  if (areaType !== null && areaType !== undefined) {
    const t = props.type
    if (t !== areaType) return null // not a filterable area in this market (e.g. a locality)
  }

  // Build the stable id from the descriptor: idSource names which property carries the base value,
  // idPrefix (optional) is prepended, kebab applied to name-sourced ids (Ottawa "3001" -> "ottawa_airport").
  const base = descriptor.idSource === "name" ? kebab(name) : (props.id as string | undefined)
  if (base === undefined || base === null || base === "")
    throw new Error(
      `[${market}] feature ${name} has no ${descriptor.idSource ?? "id"} to build id from`,
    )
  const id = `${descriptor.idPrefix ?? ""}${base}`

  if (descriptor.idPattern && !new RegExp(descriptor.idPattern).test(id)) {
    throw new Error(
      `[${market}] feature id "${id}" does not match ${descriptor.idPattern} — wrong dataset shape?`,
    )
  }

  const segs = id.split("_")
  return {
    id,
    name,
    kind: "neighbourhood",
    region: segmentFrom(region, segs, props),
    parentRegion: segmentFrom(parentRegion, segs, props),
    sourceId:
      typeof props.source_id === "string"
        ? props.source_id
        : typeof props.id === "string"
          ? props.id
          : null,
    sourceName: descriptor.sourceName,
    geometry,
  }
}

export async function loadDataset(descriptor: DatasetDescriptor): Promise<number> {
  const filePath = resolve(
    dataDir,
    isAbsolute(descriptor.file) ? descriptor.file : join(dataDir, descriptor.file),
  )
  let raw: string
  try {
    raw = readFileSync(filePath, "utf8")
  } catch (e) {
    throw new Error(`[${descriptor.market}] cannot read dataset file ${filePath}: ${String(e)}`)
  }
  let collection: { features: Array<{ properties: Record<string, unknown>; geometry: unknown }> }
  try {
    collection = JSON.parse(raw)
  } catch (e) {
    throw new Error(`[${descriptor.market}] ${descriptor.file} is not valid JSON: ${String(e)}`)
  }
  const features = (collection.features ?? [])
    .map((f) => toFeature(descriptor.market, descriptor, f))
    .filter((f): f is AreaFeatureInput => f !== null)
  const dropped = (collection.features ?? []).length - features.length
  if (dropped > 0)
    console.log(
      `  (${descriptor.market}) skipped ${dropped} non-area features (localities/parents)`,
    )
  return loadAreas(db, features)
}

async function main() {
  const datasetFiles = readdirSync(join(dataDir, "datasets"), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => join(dataDir, "datasets", d.name))
  const descriptors: DatasetDescriptor[] = []
  for (const p of datasetFiles) {
    let text: string
    try {
      text = readFileSync(p, "utf8")
    } catch (e) {
      throw new Error(`cannot read dataset descriptor ${p}: ${String(e)}`)
    }
    let parsed: DatasetDescriptor
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      throw new Error(`dataset descriptor ${p} is not valid JSON: ${String(e)}`)
    }
    descriptors.push(parsed)
  }

  let total = 0
  for (const descriptor of descriptors) {
    const count = await loadDataset(descriptor)
    total += count
    console.log(`✓ ${descriptor.market}: ${count} areas`)
  }
  console.log(`Loaded ${total} areas across ${descriptors.length} markets.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await pool.end()
  })
