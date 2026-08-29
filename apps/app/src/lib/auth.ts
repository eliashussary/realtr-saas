import { db } from "@realtr/db"
import * as schema from "@realtr/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"
import { ac, roles } from "./permissions"

const isProduction = process.env.NODE_ENV === "production"

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001"

// The session-signing secret. In production it MUST come from the environment — a hardcoded fallback
// would let anyone forge sessions — so we fail fast rather than boot with a known dev value.
function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret) return secret
  if (isProduction) {
    throw new Error("BETTER_AUTH_SECRET is required in production (refusing a known dev fallback)")
  }
  return "dev-only-change-me-please-32bytes"
}

// Cross-origin request protection for auth endpoints (CSRF / redirect allow-list). Defaults to the
// app's own origin; add extra origins (e.g. an apex + www) via BETTER_AUTH_TRUSTED_ORIGINS (CSV).
function trustedOrigins(): string[] {
  const extra = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
  return Array.from(new Set([baseURL, ...extra]))
}

// Dev-only: remember the most recent magic-link URL so the login page can auto-follow it without
// the developer copying it from the server terminal. Never populated in production.
let lastDevMagicLink: string | null = null
export function getLastDevMagicLink(): string | null {
  return isProduction ? null : lastDevMagicLink
}

// Passwordless: magic link only (no password provider). Multi-tenant via the organization
// plugin. Auth tables live in @realtr/db so migrations stay centralized.
export const auth = betterAuth({
  baseURL,
  secret: authSecret(),
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // A magic link is a bearer login credential — never write it to logs in production. In dev,
        // log it and remember it for the login page's auto-follow. Production sends it via email
        // (Resend); until that transport is wired, production simply does not surface the link.
        if (!isProduction) {
          console.log(`\n🔗 Magic link for ${email}:\n   ${url}\n`)
          lastDevMagicLink = url
        }
      },
    }),
    organization({
      ac,
      roles,
      // The broker who creates the workspace is the owner.
      creatorRole: "owner",
    }),
  ],
})
