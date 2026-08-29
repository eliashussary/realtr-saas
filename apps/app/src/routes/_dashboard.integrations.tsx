import { createFileRoute } from "@tanstack/react-router"
import { ListingsCard } from "../components/listings-card"

export const Route = createFileRoute("/_dashboard/integrations")({
  component: IntegrationsPage,
})

function IntegrationsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Integrations</h1>
      <p className="mt-2 text-muted-foreground">
        Connect the services that power your site. More sources and CRMs are coming.
      </p>
      <div className="mt-8">
        <ListingsCard />
      </div>
    </main>
  )
}
