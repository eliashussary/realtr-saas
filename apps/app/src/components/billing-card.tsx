import { Button } from "@realtr/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@realtr/ui/components/card"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { getBillingStatusFn, startCheckoutFn } from "../server/billing"

interface PlanView {
  id: "solo" | "team"
  name: string
  basePriceCents: number
  includedMembers: number
  additionalSeatPriceCents: number
}

interface BillingView {
  configured: boolean
  canManage: boolean
  status: string
  planId: string | null
  cancelAtPeriodEnd: boolean
  plans: PlanView[]
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 0 })}`
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "active" || status === "trialing"
      ? "bg-success/15 text-success"
      : status === "past_due" || status === "grace"
        ? "bg-warning/15 text-warning"
        : status === "lapsed" || status === "canceled"
          ? "bg-destructive/15 text-destructive"
          : "bg-secondary text-muted-foreground"
  const label = status === "none" ? "no subscription" : status
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{label}</span>
}

export function BillingCard() {
  const [view, setView] = useState<BillingView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getBillingStatusFn()
    if (res.ok) setView(res)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const subscribe = async (planId: "solo" | "team") => {
    setBusy(planId)
    const res = await startCheckoutFn({ data: { planId } })
    setBusy(null)
    if (res.ok) {
      window.location.href = res.url
    } else if (res.code === "not_configured") {
      toast.error("Billing is not configured yet. Add Stripe keys to enable checkout.")
    } else if (res.code === "forbidden") {
      toast.error("Only owners and admins can manage billing.")
    } else {
      toast.error("Could not start checkout. Please try again.")
    }
  }

  if (!view) return null

  const subscribed = view.status !== "none"

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Subscription</CardTitle>
        <StatusBadge status={view.status} />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {subscribed ? (
          <p className="text-sm text-muted-foreground">
            You're on the{" "}
            <span className="font-medium capitalize text-foreground">{view.planId}</span> plan.
            {view.cancelAtPeriodEnd ? " It will not renew at the end of the current period." : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a plan to start your 14-day trial. A card is required; you won't be charged until
            the trial ends.
          </p>
        )}

        {!view.configured ? (
          <p className="rounded-[var(--radius-base)] bg-secondary px-3 py-2 text-sm text-muted-foreground">
            Billing isn't configured in this environment yet.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {view.plans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col gap-2 rounded-[var(--radius-base)] border border-border p-4"
            >
              <p className="font-heading text-lg font-bold">{plan.name}</p>
              <p className="text-2xl font-bold">
                {dollars(plan.basePriceCents)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {plan.includedMembers === 1
                  ? "1 member"
                  : `${plan.includedMembers} members included`}
                {plan.additionalSeatPriceCents > 0
                  ? `, then ${dollars(plan.additionalSeatPriceCents)}/seat`
                  : ""}
              </p>
              <Button
                type="button"
                className="mt-2"
                disabled={!view.canManage || busy !== null}
                onClick={() => subscribe(plan.id)}
              >
                {busy === plan.id
                  ? "Starting…"
                  : subscribed
                    ? `Switch to ${plan.name}`
                    : "Subscribe"}
              </Button>
            </div>
          ))}
        </div>

        {!view.canManage ? (
          <p className="text-xs text-muted-foreground">
            Only owners and admins can change the subscription.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
