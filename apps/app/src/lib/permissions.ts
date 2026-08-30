import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, ownerAc } from "better-auth/plugins/organization/access"

// Single source of truth for RBAC. Used by better-auth's organization plugin (so invitations and
// its own endpoints enforce roles) AND by our server functions via `can()`. Pure module — no db,
// safe to import on the client for UI gating.
//
// Two axes are intentionally separate: a member's ROLE (what they can do here) vs. whether they are
// SHOWCASED on the site (a visible agent profile). Any role can have a profile.

export const statement = {
  // better-auth org built-ins (organization, member, invitation, team, ac)
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  // Realtr resources
  site: ["view", "edit", "publish"],
  listing: ["view", "create", "feature", "manageAny", "manageOwn", "sync"],
  integration: ["manage"],
  agentProfile: ["editAny", "editOwn"],
  lead: ["viewAll", "viewOwn", "assign", "update"],
  // Subscription management (M6): manage = checkout/portal/plan changes; view = see billing status.
  billing: ["manage", "view"],
  // Blog posts: owner/admin only (a brokerage-level channel). manage covers create/edit/delete/publish.
  post: ["manage"],
} as const

export const ac = createAccessControl(statement)

const REALTR_ALL = {
  site: ["view", "edit", "publish"],
  listing: ["view", "create", "feature", "manageAny", "manageOwn", "sync"],
  integration: ["manage"],
  agentProfile: ["editAny", "editOwn"],
  lead: ["viewAll", "viewOwn", "assign", "update"],
  billing: ["manage", "view"],
  post: ["manage"],
} as const

export const roles = {
  // Broker / account owner: everything, including org deletion + billing (later).
  owner: ac.newRole({ ...ownerAc.statements, ...REALTR_ALL }),
  // Team lead / office manager: full operations + member management, but not org deletion.
  admin: ac.newRole({ ...adminAc.statements, ...REALTR_ALL }),
  // An agent on the team: manages their own profile and their own listings; can be showcased on the
  // site. No site editing/publishing, integrations, or member management.
  agent: ac.newRole({
    site: ["view"],
    listing: ["view", "create", "manageOwn"],
    agentProfile: ["editOwn"],
    lead: ["viewOwn", "update"],
  }),
} as const

export type Role = keyof typeof roles
export type Resource = keyof typeof statement
export type Action<R extends Resource> = (typeof statement)[R][number]

export const ROLE_VALUES = Object.keys(roles) as Role[]

export function isRole(value: string): value is Role {
  return value in roles
}

/** Does this role grant `action` on `resource`? Unknown roles get the least-privileged agent set. */
export function can<R extends Resource>(role: string, resource: R, action: Action<R>): boolean {
  const r = roles[isRole(role) ? role : "agent"]
  return r.authorize({ [resource]: [action] } as never).success
}
