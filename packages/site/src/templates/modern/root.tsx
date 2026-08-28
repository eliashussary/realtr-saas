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

export function ModernRoot({
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
      <header className="flex items-center justify-between border-b border-muted/15 px-6 py-4">
        <a href="/" className="font-heading text-xl font-bold">
          {title ?? "Realtr"}
        </a>
        <nav className="flex gap-6 text-sm text-muted">
          {items.map((item) => (
            <a key={item.id} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-muted/15 px-6 py-8 text-center text-sm text-muted">
        Powered by Realtr
      </footer>
    </div>
  )
}
