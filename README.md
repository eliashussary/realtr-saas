# realtr-saas

A Shopify/Squarespace-for-realtors SaaS: realtors (and brokerages) self-serve a branded,
Airbnb-quality listing website — their listings, their branding, on their own vanity domain.

Monorepo (pnpm workspaces, Node 22+). Passwordless auth, multi-tenant, pluggable listing
sources (DDF first) and CRMs (Follow Up Boss first), Puck block editing, and zero-touch custom
domains via Caddy on-demand TLS.

## Layout

```
apps/
  app/         TanStack Start — realtor SaaS control center (auth lives here)       :3001
  renderer/    TanStack Start — public tenant sites, resolved by Host               :3000
  marketing/   TanStack Start — our brand site                                      :3002
  worker/      Node + pg-boss — background jobs; listings ingestion is job #1        :3003 (health)
packages/
  db/          @realtr/db   — Drizzle schema (incl. better-auth tables) + migrations
  ui/          @realtr/ui   — shadcn primitives, Tailwind v4 preset, ThemeTokens → CSS vars
  site/        @realtr/site — blocks/ (Puck contracts + default renders) + templates/ + registry
  core/        @realtr/core — tenant resolution + pluggable ListingSource / CRM providers
```
`admin` is intentionally reserved for a future internal ops panel — the realtor-facing app is `app`.

## Prerequisites

- Node ≥ 22, pnpm 11, Docker (for local Postgres).

## Quick start

```bash
cp .env.example .env            # dev defaults work as-is
pnpm install
pnpm docker:dev                 # Postgres on localhost:5433 (5432 is often taken)
pnpm db:migrate                 # apply schema
pnpm db:seed                    # demo org + site + demo.localhost domain
pnpm dev                        # boot all apps + worker
```

Dev URLs:
- Marketing: http://localhost:3002
- App (dashboard/login): http://localhost:3001
- A tenant site: http://demo.localhost:3000  (`*.localhost` resolves to 127.0.0.1 automatically)
- Worker health: http://localhost:3003/health

### Try the flow
1. Open http://localhost:3001/login, enter any email → the **magic link is printed to the app's
   terminal** (dev has no email provider). Open it to sign in.
2. First login onboards you: a personal org + a `modern`-template site are created. Add a vanity
   domain from the dashboard and you'll see CNAME instructions.
3. The seeded tenant renders at http://demo.localhost:3000.

## Core concepts

- **Template** = an installable site design (page presets + Root layout + default theme + which
  blocks it uses). **Theme** = branding tokens (colors/fonts/radius) → CSS variables. **Block** =
  an editable Puck component. A block's *content contract* (fields) is stable in `@realtr/site`
  `blocks/`; its *render* can be overridden per template. So switching templates preserves content.
- **Tenancy**: a tenant is an `organization` (solo realtor = 1 member, or a brokerage = many). An
  org has many `site`s; each `domain` attaches to a site. The renderer resolves Host → domain → site.
- **Vanity domains**: Caddy on-demand TLS asks `renderer:/internal/tls-check?domain=…`; a verified
  tenant domain returns 200 and Caddy auto-issues a cert. No redeploy, no manual certs.
- **Integrations are pluggable**: listing sources and CRMs sit behind provider interfaces +
  registries in `@realtr/core`. DDF and Follow Up Boss are the first (stub) providers.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Run all apps + worker in watch mode |
| `pnpm build` | Production build (Nitro output per app) |
| `pnpm check` | Typecheck all packages + Biome lint |
| `pnpm test` | Unit tests, then isolated PostgreSQL integration tests (one shot) |
| `pnpm test:unit` | Fast unit tests; no PostgreSQL or production secrets required |
| `pnpm test:integration` | Start ephemeral test Postgres on :5434, test, and tear it down |
| `pnpm format` | Biome format |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Drizzle |
| `pnpm docker:dev` / `docker:dev:down` | Local Postgres |

Integration tests require Docker Compose and an explicit `TEST_DATABASE_URL` whose database name
starts with `test_` or ends with `_test`. The default in `.env.example` targets the isolated
`docker-compose.test.yml` service; the test harness never falls back to `DATABASE_URL`. It also
creates and removes a sibling `_upgrade_test` database to exercise populated migration upgrades.

## Continuous integration

GitHub Actions runs two required checks on pull requests and `main`:

- **Quality**: frozen install, `pnpm check`, generated-route drift, unit tests, `pnpm build`, and
  Drizzle migration/snapshot drift.
- **PostgreSQL integration**: `pnpm test:integration` against the disposable Compose database.

The local equivalents are `pnpm check`, `pnpm test`, and `pnpm build`. Migration drift can be
reproduced with `pnpm db:generate` followed by
`git diff --exit-code -- packages/db/drizzle`. CI uses only repository test values and does not
receive production authentication, integration, or database secrets. Each job has a timeout, and a
new run for the same branch cancels its superseded predecessor.

## Production

Single-host `docker-compose.yml` runs Postgres + Caddy (edge, on-demand TLS) + the three apps +
worker + a one-shot migration. Set `BETTER_AUTH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, and
`ACME_EMAIL`, point DNS at the host, then `docker compose up -d --build`.

## Not built yet (seams in place)

Stripe billing · real DDF ingest port · more listing sources (RESO Web API, MLSGrid, Bridge) ·
production magic-link email · Follow Up Boss implementation · OAuth · template gallery ·
internal `apps/admin` ops panel.
