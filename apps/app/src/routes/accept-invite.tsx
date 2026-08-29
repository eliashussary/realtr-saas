import { Link, createFileRoute } from "@tanstack/react-router"
import { acceptInvitationFn } from "../server/team"

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ deps }) =>
    deps.id
      ? acceptInvitationFn({ data: { invitationId: deps.id } })
      : Promise.resolve({ ok: false as const, code: "invalid" as const }),
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const result = Route.useLoaderData()

  const content = result.ok
    ? {
        title: "You're on the team",
        body: "Your invitation has been accepted.",
        cta: { to: "/", label: "Go to dashboard" },
      }
    : result.code === "unauthenticated"
      ? {
          title: "Sign in to accept",
          body: "Sign in with the email your invitation was sent to, then open this link again.",
          cta: { to: "/login", label: "Sign in" },
        }
      : result.code === "wrong_email"
        ? {
            title: "Wrong account",
            body: `This invitation was sent to ${"email" in result ? result.email : "another address"}. Sign in with that email to accept.`,
            cta: { to: "/login", label: "Sign in" },
          }
        : {
            title: "Invitation unavailable",
            body: "This invitation is invalid, cancelled, or expired. Ask for a new one.",
            cta: { to: "/", label: "Go home" },
          }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="font-heading text-3xl font-bold">{content.title}</h1>
      <p className="mt-2 text-muted-foreground">{content.body}</p>
      <Link to={content.cta.to} className="mt-6 text-brand hover:underline">
        {content.cta.label} →
      </Link>
    </main>
  )
}
