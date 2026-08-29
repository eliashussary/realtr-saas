import { Link, useRouter } from "@tanstack/react-router"
import { Building2, Inbox, LayoutDashboard, LogOut, Plug, Shield, Users } from "lucide-react"
import type { ComponentType } from "react"
import { authClient } from "../lib/auth-client"
import { ThemeToggle } from "./theme-toggle"

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/listings", label: "Listings", icon: Building2 },
  { to: "/leads", label: "Leads", icon: Inbox },
  { to: "/team", label: "Team", icon: Users },
  { to: "/integrations", label: "Integrations", icon: Plug },
]

export function DashboardSidebar({
  orgName,
  isSuperAdmin,
}: { orgName: string; isSuperAdmin: boolean }) {
  const router = useRouter()
  const items = isSuperAdmin ? [...NAV, { to: "/admin", label: "Admin", icon: Shield }] : NAV

  async function signOut() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-secondary/30">
      <div className="px-5 py-5">
        <p className="font-heading text-lg font-bold">Realtr</p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground" title={orgName}>
          {orgName}
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            // Exact match for the overview root so it isn't "active" on every nested route.
            activeOptions={{ exact: to === "/" }}
            className="flex items-center gap-3 rounded-[var(--radius-base)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-secondary font-medium text-foreground" }}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-1 px-3 py-4">
        <ThemeToggle />
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-[var(--radius-base)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
