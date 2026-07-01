import type { CrmContext, CrmProvider, Lead } from "./types"

// Follow Up Boss — first CRM integration. STUB; real API calls land in a later slice.
export const followUpBoss: CrmProvider = {
  provider: "fub",

  async pushLead(ctx: CrmContext, lead: Lead): Promise<void> {
    console.log(`[fub] pushLead stub for org ${ctx.organizationId}`, lead.email ?? "(no email)")
  },

  async syncContact(ctx: CrmContext, lead: Lead): Promise<void> {
    console.log(`[fub] syncContact stub for org ${ctx.organizationId}`, lead.email ?? "(no email)")
  },
}
