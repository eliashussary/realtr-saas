import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realtr/ui/components/select"
import { Link, useRouter } from "@tanstack/react-router"
import {
  Building2,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  MapPinned,
  Newspaper,
  Plug,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react"
import { type ComponentType, useState } from "react"
import { authClient } from "../lib/auth-client"
import type { DashboardOrg } from "../server/tenant"
import { ThemeToggle } from "./theme-toggle"

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/listings", label: "Listings", icon: Building2 },
  { to: "/areas", label: "Areas", icon: MapPinned },
  { to: "/collections", label: "Collections", icon: LayoutGrid },
  { to: "/service-area", label: "Service area", icon: MapPinned },
  { to: "/leads", label: "Leads", icon: Inbox },
  { to: "/blog", label: "Blog", icon: Newspaper },
  { to: "/team", label: "Team", icon: Users },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/privacy", label: "Data & privacy", icon: ShieldCheck },
]

export function DashboardSidebar({
  orgName,
  isSuperAdmin,
  organizations,
  activeOrganizationId,
}: {
  orgName: string
  isSuperAdmin: boolean
  organizations: DashboardOrg[]
  activeOrganizationId: string
}) {
  const router = useRouter()
  const items = isSuperAdmin ? [...NAV, { to: "/admin", label: "Admin", icon: Shield }] : NAV
  const [switching, setSwitching] = useState(false)

  async function signOut() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }

  async function switchOrg(organizationId: string | null) {
    if (!organizationId || organizationId === activeOrganizationId) return
    setSwitching(true)
    await authClient.organization.setActive({ organizationId })
    // Land on the overview of the newly active org and re-run every loader against it.
    await router.navigate({ to: "/" })
    await router.invalidate()
    setSwitching(false)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-secondary/30">
      <div className="px-5 py-5">
        <p className="font-heading text-lg font-bold">Realtr</p>
        {organizations.length > 1 ? (
          <Select
            value={activeOrganizationId}
            onValueChange={switchOrg}
            disabled={switching}
            items={Object.fromEntries(organizations.map((o) => [o.id, o.name]))}
          >
            <SelectTrigger className="mt-2 h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="mt-0.5 truncate text-sm text-muted-foreground" title={orgName}>
            {orgName}
          </p>
        )}
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
