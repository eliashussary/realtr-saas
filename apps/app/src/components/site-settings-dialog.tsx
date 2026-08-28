import { Button } from "@realtr/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@realtr/ui/components/dialog"
import { Field, FieldDescription, FieldLabel } from "@realtr/ui/components/field"
import { Input } from "@realtr/ui/components/input"
import { PlusIcon, Trash2Icon } from "lucide-react"
import {
  type BrandingInput,
  RADIUS_PRESETS,
  type SiteSettingsInput,
  THEME_COLOR_FIELDS,
  THEME_FONT_FIELDS,
  type ThemeColorKey,
  type ThemeFontKey,
} from "./site-settings"

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

function toHexInput(value: string | undefined): string {
  return value && HEX_PATTERN.test(value.trim()) ? value.trim() : "#000000"
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-heading text-sm font-semibold text-foreground">{children}</h3>
}

export function SiteSettingsDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: BrandingInput
  onChange: (next: BrandingInput) => void
}) {
  const setSettings = (patch: Partial<SiteSettingsInput>) =>
    onChange({ ...value, settings: { ...value.settings, ...patch } })

  const setContact = (patch: Partial<SiteSettingsInput["contact"]>) =>
    setSettings({ contact: { ...value.settings.contact, ...patch } })

  const setColor = (key: ThemeColorKey, next: string) =>
    onChange({
      ...value,
      theme: { ...value.theme, colors: { ...value.theme.colors, [key]: next } },
    })

  const setFont = (key: ThemeFontKey, next: string) =>
    onChange({
      ...value,
      theme: { ...value.theme, fonts: { ...value.theme.fonts, [key]: next } },
    })

  const setRadius = (next: string) =>
    onChange({ ...value, theme: { ...value.theme, radius: next } })

  const addSocialLink = () =>
    setSettings({
      socialLinks: [
        ...value.settings.socialLinks,
        { id: crypto.randomUUID(), service: "", url: "" },
      ],
    })

  const updateSocialLink = (id: string, patch: Partial<{ service: string; url: string }>) =>
    setSettings({
      socialLinks: value.settings.socialLinks.map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      ),
    })

  const removeSocialLink = (id: string) =>
    setSettings({ socialLinks: value.settings.socialLinks.filter((link) => link.id !== id) })

  const radius = value.theme.radius ?? ""
  const radiusOptions =
    radius && !RADIUS_PRESETS.some((preset) => preset.value === radius)
      ? [{ value: radius, label: `Custom (${radius})` }, ...RADIUS_PRESETS]
      : RADIUS_PRESETS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Site settings</DialogTitle>
          <DialogDescription>
            Brand, theme, and contact details. Changes save automatically and appear when you close
            this panel; publish to make them public.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-1">
          <section className="flex flex-col gap-4">
            <SectionHeading>General</SectionHeading>
            <Field>
              <FieldLabel htmlFor="site-title">Site title</FieldLabel>
              <Input
                id="site-title"
                value={value.settings.siteTitle}
                onChange={(event) => setSettings({ siteTitle: event.target.value })}
                aria-invalid={value.settings.siteTitle.trim() === "" || undefined}
              />
              <FieldDescription>
                Shown in the browser tab and as the default page title.
              </FieldDescription>
            </Field>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading>Contact</SectionHeading>
            <Field>
              <FieldLabel htmlFor="contact-email">Email</FieldLabel>
              <Input
                id="contact-email"
                type="email"
                value={value.settings.contact.email}
                onChange={(event) => setContact({ email: event.target.value })}
                placeholder="agent@example.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
              <Input
                id="contact-phone"
                type="tel"
                value={value.settings.contact.phone}
                onChange={(event) => setContact({ phone: event.target.value })}
                placeholder="(555) 123-4567"
              />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading>Social links</SectionHeading>
            {value.settings.socialLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">No social links yet.</p>
            )}
            {value.settings.socialLinks.map((link) => (
              <div key={link.id} className="flex items-end gap-2">
                <Field className="flex-1">
                  <FieldLabel htmlFor={`social-service-${link.id}`} className="sr-only">
                    Service
                  </FieldLabel>
                  <Input
                    id={`social-service-${link.id}`}
                    value={link.service}
                    onChange={(event) => updateSocialLink(link.id, { service: event.target.value })}
                    placeholder="Instagram"
                  />
                </Field>
                <Field className="flex-[2]">
                  <FieldLabel htmlFor={`social-url-${link.id}`} className="sr-only">
                    URL
                  </FieldLabel>
                  <Input
                    id={`social-url-${link.id}`}
                    type="url"
                    value={link.url}
                    onChange={(event) => updateSocialLink(link.id, { url: event.target.value })}
                    placeholder="https://instagram.com/you"
                    aria-invalid={
                      (link.url.trim() !== "" && !isLikelyUrl(link.url)) ||
                      (link.service.trim() !== "" && link.url.trim() === "") ||
                      undefined
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${link.service || "social link"}`}
                  onClick={() => removeSocialLink(link.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button variant="outline" size="sm" onClick={addSocialLink}>
                <PlusIcon className="size-4" /> Add link
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading>Colors</SectionHeading>
            {THEME_COLOR_FIELDS.map(({ key, label }) => {
              const current = value.theme.colors?.[key] ?? ""
              return (
                <Field key={key} orientation="horizontal">
                  <FieldLabel htmlFor={`color-${key}`} className="w-24 shrink-0">
                    {label}
                  </FieldLabel>
                  <span
                    aria-hidden
                    className="size-8 shrink-0 rounded-md border border-input"
                    style={{ background: current || "transparent" }}
                  />
                  <Input
                    id={`color-${key}`}
                    value={current}
                    onChange={(event) => setColor(key, event.target.value)}
                    placeholder="#2563eb or oklch(…)"
                    className="font-mono"
                  />
                  <input
                    type="color"
                    aria-label={`${label} color picker`}
                    value={toHexInput(current)}
                    onChange={(event) => setColor(key, event.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                </Field>
              )
            })}
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading>Typography</SectionHeading>
            {THEME_FONT_FIELDS.map(({ key, label }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`font-${key}`}>{label}</FieldLabel>
                <Input
                  id={`font-${key}`}
                  value={value.theme.fonts?.[key] ?? ""}
                  onChange={(event) => setFont(key, event.target.value)}
                  placeholder="Inter, sans-serif"
                  className="font-mono"
                />
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="theme-radius">Corner radius</FieldLabel>
              <select
                id="theme-radius"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
              >
                <option value="">Default</option>
                {radiusOptions.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isLikelyUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
