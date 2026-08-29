import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realtr/ui/components/select"
import { Toaster } from "@realtr/ui/components/sonner"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { type LeadListItem, assignLeadFn, listLeadsFn, updateLeadStatusFn } from "../server/leads"

const UNASSIGNED = "__unassigned__"

export const Route = createFileRoute("/_dashboard/leads/")({
  loader: () => listLeadsFn(),
  component: LeadsPage,
})

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const
type Status = (typeof STATUSES)[number]

const STATUS_TONE: Record<string, string> = {
  new: "bg-brand/10 text-brand",
  contacted: "bg-secondary text-foreground",
  qualified: "bg-accent/15 text-foreground",
  won: "bg-success/15 text-success",
  lost: "bg-secondary text-muted-foreground",
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

function LeadsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [filter, setFilter] = useState<Status | "all">("all")
  const [busyId, setBusyId] = useState<string | null>(null)

  const items = data.ok ? data.items : []
  const canUpdate = data.ok ? data.canUpdate : false
  const canAssign = data.ok ? data.canAssign : false
  const members = data.ok ? data.members : []

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((it) => it.status === filter)),
    [items, filter],
  )

  async function changeStatus(it: LeadListItem, status: Status) {
    if (status === it.status) return
    setBusyId(it.id)
    const res = await updateLeadStatusFn({ data: { leadId: it.id, status } })
    setBusyId(null)
    if (res.ok) {
      await router.invalidate()
      toast.success(`Marked ${status}.`)
    } else {
      toast.error("Could not update the lead.")
    }
  }

  async function changeAssignee(it: LeadListItem, value: string | null) {
    const assignedMemberId = !value || value === UNASSIGNED ? null : value
    if (assignedMemberId === it.assignedMemberId) return
    setBusyId(it.id)
    const res = await assignLeadFn({ data: { leadId: it.id, assignedMemberId } })
    setBusyId(null)
    if (res.ok) {
      await router.invalidate()
      toast.success(assignedMemberId ? "Lead reassigned." : "Lead unassigned.")
    } else {
      toast.error("Could not reassign the lead.")
    }
  }

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please sign in to view leads.</p>
      </main>
    )
  }

  const newCount = items.filter((it) => it.status === "new").length

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Leads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.canViewAll
              ? "Every inquiry from your site's contact and listing forms."
              : "Inquiries assigned to you."}
            {newCount > 0 ? ` ${newCount} new.` : ""}
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Status | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-base)] border border-dashed border-border p-10 text-center">
          <p className="font-medium">No leads yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length === 0
              ? "When someone submits a contact or listing-inquiry form on your site, it lands here."
              : "No leads match this filter."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[var(--radius-base)] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Status</th>
                {canAssign ? <th className="px-3 py-2">Assigned</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t border-border align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{it.name ?? "Unknown"}</p>
                    {it.email ? (
                      <a href={`mailto:${it.email}`} className="block text-xs text-brand">
                        {it.email}
                      </a>
                    ) : null}
                    {it.phone ? (
                      <a href={`tel:${it.phone}`} className="block text-xs text-muted-foreground">
                        {it.phone}
                      </a>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-3 py-3">
                    <p className="whitespace-pre-wrap text-muted-foreground">{it.message ?? "—"}</p>
                    {it.pagePath ? (
                      <p className="mt-1 text-xs text-muted-foreground/70">from {it.pagePath}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {it.source === "listing_inquiry" ? "Listing" : "Contact form"}
                  </td>
                  <td
                    className="px-3 py-3 whitespace-nowrap text-muted-foreground"
                    title={new Date(it.createdAt).toLocaleString()}
                  >
                    {timeAgo(it.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    {canUpdate ? (
                      <Select
                        value={it.status}
                        onValueChange={(v) => changeStatus(it, v as Status)}
                        disabled={busyId === it.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[it.status] ?? "bg-secondary"}`}
                      >
                        {it.status}
                      </span>
                    )}
                  </td>
                  {canAssign ? (
                    <td className="px-3 py-3">
                      <Select
                        value={it.assignedMemberId ?? UNASSIGNED}
                        onValueChange={(v) => changeAssignee(it, v)}
                        disabled={busyId === it.id}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.memberId} value={m.memberId}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toaster />
    </main>
  )
}
