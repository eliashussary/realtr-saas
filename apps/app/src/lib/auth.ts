import { db } from "@realtr/db"
import * as schema from "@realtr/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"
import { ac, roles } from "./permissions"

const isProduction = process.env.NODE_ENV === "production"

// Dev-only: remember the most recent magic-link URL so the login page can auto-follow it without
// the developer copying it from the server terminal. Never populated in production.
let lastDevMagicLink: string | null = null
export function getLastDevMagicLink(): string | null {
  return isProduction ? null : lastDevMagicLink
}

// Passwordless: magic link only (no password provider). Multi-tenant via the organization
// plugin. Auth tables live in @realtr/db so migrations stay centralized.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me-please-32bytes",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: false },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Dev: log the link and remember it for auto-follow. Production wires a real email
        // provider (Resend) later.
        console.log(`\n🔗 Magic link for ${email}:\n   ${url}\n`)
        if (!isProduction) lastDevMagicLink = url
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
