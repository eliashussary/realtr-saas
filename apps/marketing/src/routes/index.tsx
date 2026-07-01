import { createFileRoute } from "@tanstack/react-router"

// App (SaaS control center) sign-up entry point.
const APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3001"

export const Route = createFileRoute("/")({ component: Landing })

function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <p className="font-heading text-sm font-semibold uppercase tracking-widest text-brand">
        Realtr
      </p>
      <h1 className="mt-4 font-heading text-5xl font-bold leading-tight text-foreground md:text-6xl">
        Beautiful websites for real estate agents.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted">
        Launch a branded, Airbnb-quality listing site in minutes. Your listings, your domain, your
        brand — no code, no headaches.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          href={`${APP_URL}/signup`}
          className="rounded-[var(--radius-base)] bg-brand px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          Get started
        </a>
        <a
          href={`${APP_URL}/login`}
          className="rounded-[var(--radius-base)] border border-muted/30 px-6 py-3 font-medium text-foreground transition-colors hover:bg-muted/10"
        >
          Sign in
        </a>
      </div>
    </main>
  )
}
