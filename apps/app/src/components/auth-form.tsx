import { Button } from "@realtr/ui"
import { type FormEvent, useState } from "react"
import { authClient } from "../lib/auth-client"

export function AuthForm({ heading, subtitle }: { heading: string; subtitle: string }) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await authClient.signIn.magicLink({ email, callbackURL: "/" })
    setLoading(false)
    if (res.error) {
      setError(res.error.message ?? "Something went wrong")
      return
    }
    setSent(true)
    // Dev only: skip the inbox and follow the just-issued magic link automatically.
    if (import.meta.env.DEV) window.location.href = "/api/dev/magic-link"
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-heading text-3xl font-bold">{heading}</h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>

      {sent ? (
        <div className="mt-8 rounded-[var(--radius-base)] border border-input p-6">
          <p className="font-medium">Check your inbox.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a magic link to <span className="font-medium">{email}</span>. In development the
            link is printed to the app's terminal.
          </p>
          {import.meta.env.DEV ? (
            <a
              href="/api/dev/magic-link"
              className="mt-3 inline-block text-sm text-brand underline"
            >
              Continue (dev) →
            </a>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-[var(--radius-base)] border border-input px-4 py-2.5 outline-none focus:border-brand"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Email me a magic link"}
          </Button>
        </form>
      )}
    </main>
  )
}
