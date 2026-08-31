import { classic } from "./templates/classic"
import { coastal } from "./templates/coastal"
import { estate } from "./templates/estate"
import { modern } from "./templates/modern"
import { studio } from "./templates/studio"
import type { TemplateModule } from "./types"

/** templateId -> template module. `app` and `renderer` resolve a site's template here. */
export const templateRegistry: Record<string, TemplateModule> = {
  modern,
  classic,
  estate,
  coastal,
  studio,
}

/** Resolve a template by id, falling back to the default (`modern`). */
export function getTemplate(id: string | null | undefined): TemplateModule {
  return (id ? templateRegistry[id] : undefined) ?? modern
}

export const templateList = Object.values(templateRegistry).map((t) => t.meta)
