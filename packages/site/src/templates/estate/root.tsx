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

export function EstateRoot({
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
    <div className="flex min-h-screen flex-col bg-background font-body text-foreground">
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-background/85 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-6 py-5">
          <span aria-hidden="true" />
          <a href="/" className="font-heading text-lg uppercase tracking-[0.25em]">
            {title ?? "Realtr"}
          </a>
          <nav className="flex justify-end gap-6 text-xs uppercase tracking-[0.2em]">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="text-muted transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-foreground/10 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <p className="font-heading text-sm uppercase tracking-[0.3em]">{title ?? "Realtr"}</p>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.15em]">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="text-muted transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <p className="text-xs text-muted">Powered by Realtr</p>
        </div>
      </footer>
    </div>
  )
}
