import { Button } from "@realtr/ui/components/button"
import { Field, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { type AgentProfileForm as FormValues, saveAgentProfileFn } from "../server/team"
import { ImageUpload } from "./image-upload"

export function AgentProfileForm({
  memberId,
  initial,
  isSelf,
}: {
  memberId?: string
  initial: FormValues
  isSelf: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormValues>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.displayName.trim()) {
      setError("A display name is required.")
      return
    }
    setBusy(true)
    setError(null)
    const res = await saveAgentProfileFn({
      data: {
        memberId,
        displayName: form.displayName,
        title: form.title,
        photoUrl: form.photoUrl,
        bio: form.bio,
        email: form.email,
        phone: form.phone,
        socialLinks: form.socialLinks,
        visible: form.visible,
      },
    })
    setBusy(false)
    if (res.ok) {
      toast.success("Profile saved.")
      router.navigate({ to: isSelf ? "/" : "/team" })
    } else {
      setError(
        res.code === "forbidden" ? "You don't have permission." : "Could not save the profile.",
      )
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-2xl flex-col gap-5">
      <Field>
        <FieldLabel>Photo</FieldLabel>
        <ImageUpload
          value={form.photoUrl ? [form.photoUrl] : []}
          onChange={(urls) => set("photoUrl", urls[0] ?? null)}
          max={1}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="ap-name">Display name</FieldLabel>
        <Input
          id="ap-name"
          value={form.displayName}
          onChange={(e) => set("displayName", e.target.value)}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="ap-title">Title</FieldLabel>
        <Input
          id="ap-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Sales Representative"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="ap-bio">Bio</FieldLabel>
        <textarea
          id="ap-bio"
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={5}
          className="rounded-[var(--radius-base)] border border-input px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="ap-email">Email</FieldLabel>
          <Input id="ap-email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ap-phone">Phone</FieldLabel>
          <Input id="ap-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.visible}
          onChange={(e) => set("visible", e.target.checked)}
        />
        Showcase this profile on the site
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.navigate({ to: isSelf ? "/" : "/team" })}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
