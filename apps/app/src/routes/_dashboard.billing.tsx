import { createFileRoute } from "@tanstack/react-router"
import { BillingCard } from "../components/billing-card"

export const Route = createFileRoute("/_dashboard/billing")({
  component: BillingPage,
})

function BillingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Billing</h1>
      <p className="mt-2 text-muted-foreground">
        Manage your Realtr subscription. Plans, seats, and invoices are handled securely by Stripe.
      </p>
      <div className="mt-8">
        <BillingCard />
      </div>
    </main>
  )
}
