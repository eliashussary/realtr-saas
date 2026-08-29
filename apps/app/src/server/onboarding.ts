import { randomUUID } from "node:crypto"
import { domain, agentProfile, member, organization, site, siteDocumentState } from "@realtr/db"
import type { SiteDocumentDatabase } from "@realtr/db/site-documents"
import { getTemplate } from "@realtr/site"
import {
  CURRENT_SITE_DOCUMENT_SCHEMA_VERSION,
  convertLegacySiteDocument,
} from "@realtr/site/document"
import { platformHostname } from "./platform"

export interface ProvisionedWorkspace {
  organizationId: string
  siteId: string
}

/**
 * First-login onboarding: create a personal org, an owner membership, a default `modern` site, and
 * its private V1 draft state in one transaction. The site stays private (no published revision)
 * until the user explicitly publishes (ADR 0004). The versioned draft state is the only source;
 * legacy `theme`/`pages` columns were removed once the renderer cut over to revisions.
 */
export async function provisionInitialWorkspace(
  database: SiteDocumentDatabase,
  input: { userId: string; email: string | null | undefined },
): Promise<ProvisionedWorkspace> {
  const organizationId = randomUUID()
  const emailLocal = input.email?.split("@")[0] ?? "My"
  const orgName = `${emailLocal}'s Agency`
  const orgSlug = `${emailLocal}-${organizationId.slice(0, 8)}`.toLowerCase()
  const template = getTemplate("modern")
  const siteName = `${orgName} Site`

  const document = convertLegacySiteDocument(
    {
      templateId: template.meta.id,
      theme: template.defaultTheme,
      pages: template.defaultPages,
      siteTitle: siteName,
    },
    { generateId: randomUUID },
  )

  return database.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: orgName,
      slug: orgSlug,
    })
    const ownerMemberId = randomUUID()
    await tx.insert(member).values({
      id: ownerMemberId,
      organizationId,
      userId: input.userId,
      role: "owner",
    })
    // Seed the owner a visible agent profile so a solo realtor is showcased on their site by default.
    // Being showcased is a profile, independent of the owner role — they can hide it anytime.
    await tx.insert(agentProfile).values({
      organizationId,
      memberId: ownerMemberId,
      slug: "me",
      displayName: emailLocal,
      visible: true,
    })
    const [createdSite] = await tx
      .insert(site)
      .values({
        organizationId,
        name: siteName,
        templateId: template.meta.id,
      })
      .returning({ id: site.id })
    if (!createdSite) throw new Error("Failed to create onboarding site")

    await tx.insert(siteDocumentState).values({
      siteId: createdSite.id,
      organizationId,
      draftDocument: document as unknown as Record<string, unknown>,
      draftSchemaVersion: CURRENT_SITE_DOCUMENT_SCHEMA_VERSION,
      draftUpdatedByUserId: input.userId,
    })

    // Reserve a servable platform subdomain so the site is reachable immediately (M5 will add
    // verification/state-machine for custom domains and production host strategy).
    await tx.insert(domain).values({
      siteId: createdSite.id,
      hostname: platformHostname(orgSlug),
      status: "active",
      verificationToken: randomUUID(),
      isPrimary: true,
    })

    return { organizationId, siteId: createdSite.id }
  })
}
