import { Link, createFileRoute } from "@tanstack/react-router"
import { AgentProfileForm } from "../components/agent-profile-form"
import { getAgentProfileFn } from "../server/team"

export const Route = createFileRoute("/_dashboard/profile")({
  validateSearch: (search: Record<string, unknown>): { memberId?: string } => ({
    memberId: typeof search.memberId === "string" ? search.memberId : undefined,
  }),
  loaderDeps: ({ search }) => ({ memberId: search.memberId }),
  loader: ({ deps }) => getAgentProfileFn({ data: { memberId: deps.memberId } }),
  component: ProfilePage,
})

function ProfilePage() {
  const data = Route.useLoaderData()
  const { memberId } = Route.useSearch()

  if (!data.ok) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">Profile unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don't have access to this profile.</p>
        <Link to="/team" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Team
        </Link>
      </main>
    )
  }

  const isSelf = data.memberId === undefined || memberId === undefined
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {!isSelf ? (
        <Link to="/team" className="text-sm text-brand hover:underline">
          ← Team
        </Link>
      ) : null}
      <h1 className="mt-3 font-heading text-3xl font-bold">
        {isSelf ? "My profile" : `Edit ${data.form.displayName}'s profile`}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your public profile — how you're showcased on the site. Independent of your role.
      </p>
      <AgentProfileForm memberId={memberId} initial={data.form} isSelf={isSelf} />
    </main>
  )
}
