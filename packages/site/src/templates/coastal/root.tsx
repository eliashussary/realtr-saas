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

export function CoastalRoot({
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
      <div className="sticky top-3 z-20 px-4 pt-3">
        <header className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-border bg-background/80 px-6 py-3 backdrop-blur">
          <a href="/" className="font-heading text-xl text-brand">
            {title ?? "Realtr"}
          </a>
          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-accent/20 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
      </div>
      <main className="pt-10">{children}</main>
      <footer className="mt-16 rounded-t-[2.5rem] border-t border-border bg-accent/10 px-6 py-12 text-center">
        <p className="font-heading text-lg text-brand">{title ?? "Realtr"}</p>
        <nav className="mt-3 flex justify-center gap-x-5 text-sm text-muted">
          {items.map((item) => (
            <a key={item.id} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>
        <p className="mt-4 text-xs text-muted">Powered by Realtr</p>
      </footer>
    </div>
  )
}
