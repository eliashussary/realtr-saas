import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

// Cycles system → light → dark. Renders a stable placeholder until mounted so the icon (which
// depends on the resolved theme) never causes a hydration mismatch.
const ORDER = ["system", "light", "dark"] as const
const ICON = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = mounted ? ((theme in ICON ? theme : "system") as keyof typeof ICON) : "system"
  const Icon = ICON[current]

  function cycle() {
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system"
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${current}. Click to change.`}
      title={`Theme: ${current}`}
      className="flex w-full items-center gap-3 rounded-[var(--radius-base)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon className="size-4" />
      <span className="capitalize">{current}</span>
    </button>
  )
}
