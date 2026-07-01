import { createFileRoute } from "@tanstack/react-router"

// Mounts better-auth at /api/auth/*. Dynamic import keeps db/pg out of the client bundle.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("../../../lib/auth")).auth.handler(request),
      POST: async ({ request }) => (await import("../../../lib/auth")).auth.handler(request),
    },
  },
})
