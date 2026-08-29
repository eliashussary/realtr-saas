import { createFileRoute } from "@tanstack/react-router"
import { AgentDetailPage, agentDetailHead, loadAgentDetailRoute } from "../agents-data"

export const Route = createFileRoute("/agents/$slug")({
  loader: ({ params }) => loadAgentDetailRoute(params.slug),
  head: ({ loaderData }) => agentDetailHead(loaderData),
  component: AgentDetailRoute,
})

function AgentDetailRoute() {
  return <AgentDetailPage data={Route.useLoaderData()} />
}
