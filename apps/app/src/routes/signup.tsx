import { createFileRoute } from "@tanstack/react-router"
import { AuthForm } from "../components/auth-form"

export const Route = createFileRoute("/signup")({
  component: () => (
    <AuthForm
      heading="Create your account"
      subtitle="No passwords. Enter your email and we'll send a magic link to get started."
    />
  ),
})
