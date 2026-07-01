import type { ReactNode } from "react"

export function ModernRoot({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="flex items-center justify-between border-b border-muted/15 px-6 py-4">
        <a href="/" className="font-heading text-xl font-bold">
          {title ?? "Realtr"}
        </a>
        <nav className="flex gap-6 text-sm text-muted">
          <a href="/">Home</a>
          <a href="#listings">Listings</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-muted/15 px-6 py-8 text-center text-sm text-muted">
        Powered by Realtr
      </footer>
    </div>
  )
}
