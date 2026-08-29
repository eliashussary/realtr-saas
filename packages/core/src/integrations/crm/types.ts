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
  /** Injectable for offline contract tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface PushResult {
  /** The CRM's record id for this lead, when the API returns one. */
  externalId?: string
}

export interface ConnectionResult {
  ok: boolean
  error?: string
}

export interface CrmProvider {
  readonly provider: string
  /** Verify the stored credentials without side effects (for the connect UI). */
  testConnection(ctx: CrmContext): Promise<ConnectionResult>
  /** Push a new inbound lead to the CRM. Throws on delivery failure so the caller can retry. */
  pushLead(ctx: CrmContext, lead: Lead): Promise<PushResult>
}
