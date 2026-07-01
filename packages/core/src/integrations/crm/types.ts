// CRM provider interface. Follow Up Boss first; same seam pattern as listing sources.

export interface Lead {
  name?: string
  email?: string
  phone?: string
  message?: string
  source?: string
}

export interface CrmContext {
  config: Record<string, unknown>
  organizationId: string
}

export interface CrmProvider {
  readonly provider: string
  /** Push a new inbound lead (e.g. a contact-form submission) to the CRM. */
  pushLead(ctx: CrmContext, lead: Lead): Promise<void>
  /** Upsert a contact record. */
  syncContact(ctx: CrmContext, lead: Lead): Promise<void>
}
