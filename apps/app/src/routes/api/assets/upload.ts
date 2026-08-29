import { createFileRoute } from "@tanstack/react-router"

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

// Authenticated image upload. Owner/admin only, tenant-scoped. Accepts multipart/form-data with a
// `file` field; validation (type/size) lives in @realtr/core so every upload path shares it.
export const Route = createFileRoute("/api/assets/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth } = await import("../../../lib/auth")
        const { resolveOrganizationAuthorization } = await import("../../../server/authorization")
        const session = await auth.api.getSession({ headers: request.headers })
        const authorization = await resolveOrganizationAuthorization(session)
        if (!authorization.ok) return json({ ok: false, code: "unauthorized" }, 401)
        if (authorization.role !== "owner" && authorization.role !== "admin") {
          return json({ ok: false, code: "forbidden" }, 403)
        }

        const form = await request.formData()
        const file = form.get("file")
        if (!(file instanceof File) || file.size === 0) {
          return json({ ok: false, code: "empty" }, 400)
        }

        const { storeUploadedImage } = await import("@realtr/core")
        const result = await storeUploadedImage({
          organizationId: authorization.organizationId,
          contentType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
          originalFilename: file.name,
        })
        if (!result.ok) return json({ ok: false, code: result.code }, 400)
        return json({ ok: true, asset: { id: result.asset.id, url: result.asset.url } }, 200)
      },
    },
  },
})
