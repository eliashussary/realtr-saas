import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { DashboardSidebar } from "../components/dashboard-sidebar"
import { getDashboardShell } from "../server/tenant"

export const Route = createFileRoute("/_dashboard")({
  loader: async () => {
    const shell = await getDashboardShell()
    if (!shell) throw redirect({ to: "/login" })
    return shell
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const { orgName, isSuperAdmin, organizations, activeOrganizationId } = Route.useLoaderData()
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        orgName={orgName}
        isSuperAdmin={isSuperAdmin}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
