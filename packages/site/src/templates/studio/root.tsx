import type { ReactNode } from "react"

interface NavItem {
  id: string
  label: string
  href: string
}

const DEFAULT_NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "listings", label: "Listings", href: "#listings" },
  { id: "contact", label: "Contact", href: "#contact" },
]

export function StudioRoot({
  children,
  title,
  nav,
}: {
  children: ReactNode
  title?: string
  nav?: NavItem[]
}) {
  // Fall back to a sensible default menu until the site defines its own navigation.
  const items = nav && nav.length > 0 ? nav : DEFAULT_NAV
  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-10 border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="font-heading text-lg font-bold uppercase tracking-tight">
            {title ?? "Realtr"}
            <span className="text-brand">.</span>
          </a>
          <nav className="flex gap-6">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="text-xs font-semibold uppercase tracking-[0.15em] text-muted transition-colors hover:text-brand"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <p className="font-heading text-3xl font-bold uppercase tracking-tight md:text-5xl">
            {title ?? "Realtr"}
          </p>
          <div className="mt-8 flex flex-col gap-4 border-t border-background/25 pt-6 md:flex-row md:items-center md:justify-between">
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="text-xs font-semibold uppercase tracking-[0.15em] text-background/70 transition-colors hover:text-background"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <p className="text-xs text-background/60">Powered by Realtr</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
