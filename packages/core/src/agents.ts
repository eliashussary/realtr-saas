import { db } from "@realtr/db"
import {
  type AgentProfileRecord,
  getVisibleAgentProfileBySlug,
  listAgentProfiles,
} from "@realtr/db/agent-profiles"

// Public read side for the renderer: a tenant's showcased (visible) agent profiles.
export type { AgentProfileRecord }

export function listPublishedAgents(organizationId: string): Promise<AgentProfileRecord[]> {
  return listAgentProfiles(db, organizationId, { visibleOnly: true })
}

export function getPublishedAgent(
  organizationId: string,
  slug: string,
): Promise<AgentProfileRecord | null> {
  return getVisibleAgentProfileBySlug(db, organizationId, slug)
}
