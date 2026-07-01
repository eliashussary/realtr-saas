import type { ComponentConfig, Config } from "@measured/puck"
import { about } from "./about"
import { contact } from "./contact"
import { gallery } from "./gallery"
import { hero } from "./hero"
import { listingGrid } from "./listing-grid"
import { richText } from "./rich-text"

// Puck component props are heterogeneous per block; `any` is the pragmatic type for the mixed map.
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous Puck component configs
type AnyComponentConfig = ComponentConfig<any>

// Core block library. Keys are the block type names referenced in Puck page data.
export const coreBlocks = {
  Hero: hero,
  ListingGrid: listingGrid,
  About: about,
  Contact: contact,
  RichText: richText,
  Gallery: gallery,
} satisfies Record<string, AnyComponentConfig>

export type CoreBlockName = keyof typeof coreBlocks

export interface ComposeOptions {
  /** Replace a core block's `render` for a template, keeping its stable field contract. */
  renderOverrides?: Partial<Record<CoreBlockName, AnyComponentConfig["render"]>>
  /** Template-exclusive blocks (full Puck component configs). */
  extraBlocks?: Record<string, AnyComponentConfig>
  root?: Config["root"]
  categories?: Config["categories"]
}

/** Assemble a Puck Config from the core blocks + a template's overrides/extras. */
export function composeConfig(opts: ComposeOptions = {}): Config {
  const components: Record<string, AnyComponentConfig> = {}
  for (const [name, cfg] of Object.entries(coreBlocks)) {
    const override = opts.renderOverrides?.[name as CoreBlockName]
    components[name] = override ? { ...cfg, render: override } : cfg
  }
  if (opts.extraBlocks) Object.assign(components, opts.extraBlocks)
  return { components, root: opts.root, categories: opts.categories }
}

export { hero, listingGrid, about, contact, richText, gallery }
