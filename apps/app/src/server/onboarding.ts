import { randomUUID } from "node:crypto"
import {
  domain,
  agentProfile,
  and,
  desc,
  eq,
  invitation,
  member,
  organization,
  site,
  siteDocumentState,
  sql,
} from "@realtr/db"
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
 * Consume a pending invitation for this email, joining the inviting org. Returns true if a
 * membership was created. Kept ahead of provisioning so an invited agent who simply signs in joins
 * the org that invited them instead of getting a spurious personal tenant.
 */
async function acceptPendingInvitation(
  database: SiteDocumentDatabase,
  input: { userId: string; email: string },
): Promise<boolean> {
  const email = input.email.toLowerCase()
  const [invite] = await database
    .select()
    .from(invitation)
    .where(and(eq(invitation.email, email), eq(invitation.status, "pending")))
    .orderBy(desc(invitation.expiresAt)) // freshest wins if invited to several orgs
    .limit(1)
  if (!invite || invite.expiresAt.getTime() < Date.now()) return false

  await database.transaction(async (tx) => {
    const already = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, invite.organizationId), eq(member.userId, input.userId)))
      .limit(1)
    if (!already[0]) {
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId: invite.organizationId,
        userId: input.userId,
        role: invite.role ?? "agent",
      })
    }
    await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, invite.id))
  })
  return true
}

/**
 * Give a membership-less user a workspace on first sign-in. Honors a pending invitation first (join
 * the inviting org); otherwise provisions a personal org + starter site. This is the single choke
 * point both dashboard loaders call, so invited agents never get a spurious tenant.
 */
export async function ensureWorkspace(
  database: SiteDocumentDatabase,
  input: { userId: string; email: string | null | undefined },
): Promise<void> {
  // The dashboard layout and overview loaders both call this in parallel on a user's first load.
  // Without serialization they each pass the "no membership" check and each provision, yielding
  // duplicate memberships (invited user) or duplicate personal orgs (new user). A per-user advisory
  // lock held for the transaction serializes them; the re-check inside makes the loser a no-op.
  await database.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId})::bigint)`)
    const [existing] = await tx
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, input.userId))
      .limit(1)
    if (existing) return

    const inner = tx as unknown as SiteDocumentDatabase
    if (
      input.email &&
      (await acceptPendingInvitation(inner, { userId: input.userId, email: input.email }))
    ) {
      return
    }
    await provisionInitialWorkspace(inner, input)
  })
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
