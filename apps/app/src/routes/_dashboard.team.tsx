import { Button } from "@realtr/ui/components/button"
import { Input } from "@realtr/ui/components/input"
import { Toaster } from "@realtr/ui/components/sonner"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import {
  type TeamMember,
  cancelInvitationFn,
  inviteMemberFn,
  removeMemberFn,
  setMemberRoleFn,
} from "../server/team"

export const Route = createFileRoute("/_dashboard/team")({
  loader: async () => {
    const { getTeamFn } = await import("../server/team")
    return getTeamFn()
  },
  component: TeamPage,
})

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent" }

function ProfileBadge({ member }: { member: TeamMember }) {
  if (!member.profile) {
    return <span className="text-xs text-muted-foreground">No profile</span>
  }
  return member.profile.visible ? (
    <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
      Showcased
    </span>
  ) : (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
      Hidden
    </span>
  )
}

function TeamPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "agent">("agent")
  const [busy, setBusy] = useState(false)

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please sign in to view your team.</p>
      </main>
    )
  }

  const { members, invites, canManageMembers, canAssignOwner, myMemberId } = data
  const roleOptions = canAssignOwner ? ["owner", "admin", "agent"] : ["admin", "agent"]

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await inviteMemberFn({ data: { email, role: inviteRole } })
    setBusy(false)
    if (res.ok) {
      setEmail("")
      await router.invalidate()
      toast.success("Invitation sent.", {
        description: res.inviteUrl ? "Dev: invite link logged to the app terminal." : undefined,
      })
    } else {
      toast.error(
        res.code === "already_member" ? "That person is already on the team." : "Could not invite.",
      )
    }
  }

  async function changeRole(member: TeamMember, role: string) {
    const res = await setMemberRoleFn({ data: { memberId: member.memberId, role: role as never } })
    if (res.ok) {
      await router.invalidate()
      toast.success("Role updated.")
    } else {
      toast.error(
        res.code === "last_owner" ? "There must be at least one owner." : "Could not change role.",
      )
    }
  }

  async function remove(member: TeamMember) {
    if (!window.confirm(`Remove ${member.name || member.email} from the team?`)) return
    const res = await removeMemberFn({ data: { memberId: member.memberId } })
    if (res.ok) {
      await router.invalidate()
      toast.success("Member removed.")
    } else {
      toast.error("Could not remove that member.")
    }
  }

  async function cancelInvite(id: string) {
    const res = await cancelInvitationFn({ data: { invitationId: id } })
    if (res.ok) {
      await router.invalidate()
      toast.success("Invitation cancelled.")
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-heading text-3xl font-bold">Team</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everyone in your brokerage. Roles control what they can do; a profile controls whether
        they're showcased on the site — the two are independent.
      </p>

      {canManageMembers ? (
        <form onSubmit={invite} className="mt-6 flex flex-wrap items-end gap-3">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@brokerage.com"
            className="max-w-xs"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "agent")}
            className="rounded-[var(--radius-base)] border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={busy}>
            {busy ? "Inviting…" : "Invite"}
          </Button>
        </form>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-[var(--radius-base)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Profile</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const canEditThisRole = canManageMembers && (canAssignOwner || m.role !== "owner")
              return (
                <tr key={m.memberId} className="border-t border-border align-middle">
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {m.name || m.email}
                      {m.memberId === myMemberId ? (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    {canEditThisRole ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value)}
                        className="rounded-[var(--radius-base)] border border-input bg-background px-2 py-1 text-sm"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r] ?? r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{ROLE_LABELS[m.role] ?? m.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ProfileBadge member={m} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-3">
                      {m.memberId === myMemberId ? (
                        <Link to="/profile" className="text-xs text-brand hover:underline">
                          Edit my profile
                        </Link>
                      ) : data.canEditAnyProfile ? (
                        <Link
                          to="/profile"
                          search={{ memberId: m.memberId }}
                          className="text-xs text-brand hover:underline"
                        >
                          Edit profile
                        </Link>
                      ) : null}
                      {canManageMembers && m.memberId !== myMemberId && canEditThisRole ? (
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canManageMembers && invites.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">Pending invitations</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium">{i.email}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {ROLE_LABELS[i.role] ?? i.role}
                </span>
                <button
                  type="button"
                  onClick={() => cancelInvite(i.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Toaster />
    </main>
  )
}
