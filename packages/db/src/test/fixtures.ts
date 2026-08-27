import { domain, member, organization, site, user } from "../schema"
import type { TestDatabase } from "./database"

export const tenantFixtureIds = {
  alpha: {
    userId: "test-user-alpha",
    organizationId: "test-org-alpha",
    memberId: "test-member-alpha",
  },
  beta: {
    userId: "test-user-beta",
    organizationId: "test-org-beta",
    memberId: "test-member-beta",
  },
} as const

export async function createTwoTenantFixture(database: TestDatabase) {
  const tenants = [
    { key: "alpha", name: "Alpha Realty", hostname: "alpha.test.local" },
    { key: "beta", name: "Beta Realty", hostname: "beta.test.local" },
  ] as const

  return database.db.transaction(async (tx) => {
    const result = []
    for (const tenant of tenants) {
      const ids = tenantFixtureIds[tenant.key]
      await tx.insert(user).values({
        id: ids.userId,
        name: `${tenant.name} User`,
        email: `${tenant.key}@fixture.test`,
        emailVerified: true,
      })
      await tx.insert(organization).values({
        id: ids.organizationId,
        name: tenant.name,
        slug: `fixture-${tenant.key}`,
      })
      await tx.insert(member).values({
        id: ids.memberId,
        organizationId: ids.organizationId,
        userId: ids.userId,
        role: "owner",
      })
      const [createdSite] = await tx
        .insert(site)
        .values({
          organizationId: ids.organizationId,
          ownerMemberId: ids.memberId,
          name: `${tenant.name} Site`,
        })
        .returning()
      if (!createdSite) throw new Error(`Failed to create ${tenant.key} fixture site`)
      const [createdDomain] = await tx
        .insert(domain)
        .values({
          siteId: createdSite.id,
          hostname: tenant.hostname,
          status: "active",
          verificationToken: `fixture-${tenant.key}-token`,
          isPrimary: true,
        })
        .returning()
      if (!createdDomain) throw new Error(`Failed to create ${tenant.key} fixture domain`)
      result.push({ ...tenant, ids, site: createdSite, domain: createdDomain })
    }
    return result
  })
}
