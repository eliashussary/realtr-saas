import { createFileRoute } from "@tanstack/react-router"
import { AuthForm } from "../components/auth-form"

export const Route = createFileRoute("/login")({
  component: () => (
    <AuthForm heading="Sign in" subtitle="Passwordless — we'll email you a magic link." />
  ),
})
