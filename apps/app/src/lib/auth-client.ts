import { magicLinkClient, organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

// baseURL defaults to the current origin (the app), where /api/auth/* is mounted.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
})
