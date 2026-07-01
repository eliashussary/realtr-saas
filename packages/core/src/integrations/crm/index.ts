import { followUpBoss } from "./follow-up-boss"
import type { CrmProvider } from "./types"

/** provider -> CRM. Register new CRMs here. */
export const crmRegistry: Record<string, CrmProvider> = {
  fub: followUpBoss,
}

export function getCrm(provider: string): CrmProvider | undefined {
  return crmRegistry[provider]
}

export type { CrmContext, CrmProvider, Lead } from "./types"
