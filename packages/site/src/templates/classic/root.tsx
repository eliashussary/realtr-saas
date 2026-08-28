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

export function ClassicRoot({
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
      <header className="border-b-2 border-brand/40 px-6 py-8 text-center">
        <a href="/" className="font-heading text-3xl font-bold tracking-wide text-brand">
          {title ?? "Realtr"}
        </a>
        <nav className="mt-4 flex justify-center gap-8 text-sm tracking-wide text-muted uppercase">
          {items.map((item) => (
            <a key={item.id} href={item.href} className="hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-4">{children}</main>
      <footer className="mt-8 border-t border-muted/20 px-6 py-8 text-center font-heading text-sm text-muted">
        Powered by Realtr
      </footer>
    </div>
  )
}
