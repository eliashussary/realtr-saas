# Authenticated server entry-point inventory

Inventory taken at commit `d80a193` for M0-A1.

| Entry point | Resource | Authentication | Organization/ownership check after M0-A1 |
|---|---|---|---|
| `getDashboard` (`GET` server function) | Organization, sites, domains | Better Auth session; unauthenticated returns `null` for the login redirect | Resolves stored membership through the shared guard; sites are constrained to its organization and domains are reached through those sites |
| `addDomain` (`POST` server function) | Site and new domain | Better Auth session; throws when absent | Only checks that the site ID exists. This known vulnerability is intentionally reserved for M0-A2 |
| `/api/auth/$` (`GET`, `POST` route) | Better Auth sessions and organization-plugin endpoints | Better Auth owns authentication and endpoint-specific authorization | Delegates directly to Better Auth; it is an authentication transport, not a tenant application-data entry point |

The `/`, `/login`, and `/signup` route loaders/components add no other server data entry points.
Public renderer routes and worker jobs are outside this authenticated control-centre inventory.
