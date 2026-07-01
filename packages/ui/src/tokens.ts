// Canonical branding token schema. A site's `theme` is a (partial) ThemeTokens value.
// `themeToCssVars` turns it into the `--t-*` CSS custom properties that theme.css maps
// onto Tailwind utilities (bg-brand, text-foreground, font-heading, ...).

export interface ThemeTokens {
  colors?: {
    brand?: string
    accent?: string
    background?: string
    foreground?: string
    muted?: string
  }
  fonts?: {
    heading?: string
    body?: string
  }
  radius?: string
}

/** Map ThemeTokens -> CSS custom properties. Spread onto a wrapping element's `style`. */
export function themeToCssVars(theme: ThemeTokens | undefined | null): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!theme) return vars
  const { colors, fonts, radius } = theme
  if (colors?.brand) vars["--t-brand"] = colors.brand
  if (colors?.accent) vars["--t-accent"] = colors.accent
  if (colors?.background) vars["--t-bg"] = colors.background
  if (colors?.foreground) vars["--t-fg"] = colors.foreground
  if (colors?.muted) vars["--t-muted"] = colors.muted
  if (fonts?.heading) vars["--t-font-heading"] = fonts.heading
  if (fonts?.body) vars["--t-font-body"] = fonts.body
  if (radius) vars["--t-radius"] = radius
  return vars
}
