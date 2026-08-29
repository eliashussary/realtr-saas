import { getPublishedAgent, resolvePublishedSite } from "@realtr/core"
import type { SiteDocumentV1 } from "@realtr/site/document"
import { createServerFn } from "@tanstack/react-start"
import { resolveOrigin } from "./seo"
import { SiteShell } from "./site-shell"

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

interface SerializedAgent {
  slug: string
  displayName: string
  title: string | null
  photoUrl: string | null
  bio: string | null
  email: string | null
  phone: string | null
}

export type AgentDetailData =
  | { status: "ok"; document: Json; agent: SerializedAgent; origin: string }
  | { status: "not_found" }
  | { status: "error" }

const loadAgentDetail = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<AgentDetailData> => {
    const { getRequestHeader, setResponseStatus } = await import("@tanstack/react-start/server")
    const host = getRequestHeader("host") ?? ""
    const origin = resolveOrigin(host, getRequestHeader("x-forwarded-proto"))
    const site = await resolvePublishedSite(host)
    if (site.status === "error") {
      ;(setResponseStatus as (s: number) => void)(503)
      return { status: "error" }
    }
    if (site.status !== "ok") {
      ;(setResponseStatus as (s: number) => void)(404)
      return { status: "not_found" }
    }
    const agent = await getPublishedAgent(site.organizationId, slug)
    if (!agent) {
      ;(setResponseStatus as (s: number) => void)(404)
      return { status: "not_found" }
    }
    return {
      status: "ok",
      document: site.document as Json,
      origin,
      agent: {
        slug: agent.slug,
        displayName: agent.displayName,
        title: agent.title,
        photoUrl: agent.photoUrl,
        bio: agent.bio,
        email: agent.email,
        phone: agent.phone,
      },
    }
  })

export function loadAgentDetailRoute(slug: string): Promise<AgentDetailData> {
  return loadAgentDetail({ data: slug })
}

export function agentDetailHead(data: AgentDetailData | undefined) {
  if (!data || data.status !== "ok") return { meta: [{ title: "Agent not found" }] }
  const doc = data.document as unknown as SiteDocumentV1
  const title = `${data.agent.displayName} — ${doc.settings.siteTitle}`
  const meta: Array<Record<string, string>> = [{ title }, { property: "og:title", content: title }]
  if (data.agent.title) meta.push({ name: "description", content: data.agent.title })
  if (data.agent.photoUrl) meta.push({ property: "og:image", content: data.agent.photoUrl })
  return {
    meta,
    links: [
      { rel: "canonical", href: `${data.origin}/agents/${encodeURIComponent(data.agent.slug)}` },
    ],
  }
}

export function AgentDetailPage({ data }: { data: AgentDetailData }) {
  if (data.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-muted">
        This site is temporarily unavailable.
      </div>
    )
  }
  if (data.status !== "ok") {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-muted">
        This agent could not be found.
      </div>
    )
  }
  const document = data.document as unknown as SiteDocumentV1
  const a = data.agent
  return (
    <SiteShell document={document}>
      <article className="mx-auto max-w-3xl px-6 py-12">
        <a href="/" className="text-sm text-brand hover:underline">
          ← Home
        </a>
        <div className="mt-6 flex flex-col items-center text-center">
          {a.photoUrl ? (
            <img
              src={a.photoUrl}
              alt={a.displayName}
              className="size-40 rounded-full object-cover"
            />
          ) : null}
          <h1 className="mt-4 font-heading text-3xl font-bold">{a.displayName}</h1>
          {a.title ? <p className="text-muted">{a.title}</p> : null}
          <div className="mt-3 flex gap-4 text-sm">
            {a.email ? (
              <a href={`mailto:${a.email}`} className="text-brand hover:underline">
                {a.email}
              </a>
            ) : null}
            {a.phone ? (
              <a href={`tel:${a.phone}`} className="text-brand hover:underline">
                {a.phone}
              </a>
            ) : null}
          </div>
        </div>
        {a.bio ? <p className="mt-8 whitespace-pre-line text-foreground">{a.bio}</p> : null}
      </article>
    </SiteShell>
  )
}
