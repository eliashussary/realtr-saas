import { db } from "@realtr/db"
import * as schema from "@realtr/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"

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
        // Dev: log the link. Production wires a real email provider (Resend) later.
        console.log(`\n🔗 Magic link for ${email}:\n   ${url}\n`)
      },
    }),
    organization(),
  ],
})
