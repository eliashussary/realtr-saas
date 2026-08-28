import type { ThemeTokens } from "@realtr/ui/tokens"

// Editing shapes for the theme & site-settings panel. These mirror the `settings` and `theme`
// branches of the site document (see @realtr/site/document) but keep every field as a plain string
// so a half-typed value never crashes a controlled input. `cleanBrandingInput` turns them back into
// the pruned, schema-valid shape the draft API persists.

export interface SocialLinkInput {
  id: string
  service: string
  url: string
}

export interface SiteSettingsInput {
  siteTitle: string
  logoAssetId?: string
  contact: { email: string; phone: string }
  socialLinks: SocialLinkInput[]
}

export interface BrandingInput {
  settings: SiteSettingsInput
  theme: ThemeTokens
}

export type ThemeColorKey = keyof NonNullable<ThemeTokens["colors"]>
export type ThemeFontKey = keyof NonNullable<ThemeTokens["fonts"]>

export const THEME_COLOR_FIELDS: ReadonlyArray<{ key: ThemeColorKey; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "muted", label: "Muted" },
]

export const THEME_FONT_FIELDS: ReadonlyArray<{ key: ThemeFontKey; label: string }> = [
  { key: "heading", label: "Headings" },
  { key: "body", label: "Body" },
]

export const RADIUS_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "0", label: "None" },
  { value: "0.25rem", label: "Small" },
  { value: "0.5rem", label: "Medium" },
  { value: "0.75rem", label: "Large" },
  { value: "1rem", label: "Extra large" },
]

/** Build editable branding input from a loaded (schema-valid) site document. */
export function brandingFromDocument(document: {
  settings?: {
    siteTitle?: string
    logoAssetId?: string
    contact?: { email?: string; phone?: string }
    socialLinks?: Array<{ id: string; service: string; url: string }>
  }
  theme?: ThemeTokens
}): BrandingInput {
  const settings = document.settings ?? {}
  return {
    settings: {
      siteTitle: settings.siteTitle ?? "",
      logoAssetId: settings.logoAssetId,
      contact: {
        email: settings.contact?.email ?? "",
        phone: settings.contact?.phone ?? "",
      },
      socialLinks: (settings.socialLinks ?? []).map((link) => ({
        id: link.id,
        service: link.service,
        url: link.url,
      })),
    },
    theme: {
      colors: { ...document.theme?.colors },
      fonts: { ...document.theme?.fonts },
      radius: document.theme?.radius,
    },
  }
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function pruneStringRecord<T extends Record<string, string | undefined>>(
  record: T | undefined,
): Partial<T> | undefined {
  if (!record) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    const trimmed = value?.trim()
    if (trimmed) out[key] = trimmed
  }
  return Object.keys(out).length > 0 ? (out as Partial<T>) : undefined
}

export interface CleanBranding {
  settings: {
    siteTitle: string
    logoAssetId?: string
    contact: { email?: string; phone?: string }
    socialLinks: Array<{ id: string; service: string; url: string }>
  }
  theme: ThemeTokens
}

/**
 * Convert editing input into the pruned shape the draft API persists. Empty values are dropped so
 * the strict document schema accepts the result, and only complete, valid social links survive — a
 * half-typed row stays visible in the form but never blocks autosave of the rest of the document.
 */
export function cleanBrandingInput(input: BrandingInput): CleanBranding {
  const colors = pruneStringRecord(input.theme.colors)
  const fonts = pruneStringRecord(input.theme.fonts)
  const radius = input.theme.radius?.trim()

  const theme: ThemeTokens = {}
  if (colors) theme.colors = colors
  if (fonts) theme.fonts = fonts
  if (radius) theme.radius = radius

  const socialLinks = input.settings.socialLinks
    .map((link) => ({ id: link.id, service: link.service.trim(), url: link.url.trim() }))
    .filter((link) => link.service !== "" && isSafeHttpUrl(link.url))

  const contact: { email?: string; phone?: string } = {}
  const email = input.settings.contact.email.trim()
  const phone = input.settings.contact.phone.trim()
  if (email) contact.email = email
  if (phone) contact.phone = phone

  const settings: CleanBranding["settings"] = {
    siteTitle: input.settings.siteTitle.trim(),
    contact,
    socialLinks,
  }
  if (input.settings.logoAssetId) settings.logoAssetId = input.settings.logoAssetId

  return { settings, theme }
}
