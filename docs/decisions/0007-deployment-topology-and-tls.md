# ADR 0007: Reverse proxy, custom-domain TLS, and the scale-out path

- Status: Accepted
- Date: 2026-08-29
- Decision owners: product owner and platform engineers
- Closes (in part): the "deployment target beyond the current single-host Docker topology"
  open decision in `docs/EXECUTION_PLAN.md`

## Context

Production runs as a single-host Docker Compose stack: `postgres`, `app`, `renderer`, `marketing`,
`worker`, and `caddy`, with two load-bearing local volumes — `pgdata` (Postgres) and `caddy_data`
(on-demand TLS certificates). Assets are already externalized to S3; sessions, the site documents,
listings, billing, and the pg-boss job queue all live in Postgres.

The distinctive infrastructure requirement is **zero-touch HTTPS for an unbounded, changing set of
tenant-supplied custom domains**: a customer CNAMEs their domain to the renderer edge and it must be
served over TLS without any per-domain configuration or deploy, while random domains pointed at our
IP must not be able to trigger certificate issuance.

## Decision

**Reverse proxy / TLS: keep Caddy with on-demand TLS gated by the renderer `ask` endpoint.**
Caddy's `on_demand_tls { ask … }` issues a certificate on the first TLS handshake only when
`/internal/tls-check` (`isServableDomain`, backed by the domain state machine) approves the host.
This is a native primitive with no config reload per domain, and the `ask` gate doubles as the DDF
"serve only on approved hostnames" enforcement point. Traefik was evaluated and rejected for this
workload: it has no per-hostname issuance-gate webhook (you must sync a router per verified domain
into a dynamic provider), and distributed/HA ACME storage is a Traefik Enterprise feature, whereas
Caddy/CertMagic supports shared cert storage in the OSS build. Traefik's strengths (service
discovery, middleware, K8s ingress) are largely unused by a single-backend, host-routed renderer.

**Deployment: single host now; a phased, state-externalizing path to multi-node.** The app/renderer/
marketing tiers are stateless and the worker is pg-boss-concurrency-safe, so horizontal scale is
gated by shared state, not the code.

### Scale-out phases (each independently useful)

1. **Externalize state.** Move Postgres to managed (RDS/Cloud SQL/Neon); assets already on S3;
   distribute secrets (esp. `INTEGRATION_ENCRYPTION_KEY`, `SESSION_SECRET`) via a secrets manager so
   every node shares them. The node becomes disposable with no app changes.
2. **Horizontal stateless tiers + workers.** N replicas of app/renderer/marketing behind a load
   balancer (DB-backed sessions → no stickiness); N worker replicas (pg-boss `SKIP LOCKED` +
   per-credential `singletonKey`; `boss.schedule` fires once cluster-wide). Put a **CDN** in front of
   the renderer — published pages are content-addressed (ETag = revision id) and cache well.
3. **Multi-node TLS.** Either (a) Caddy cluster with **shared CertMagic storage** (Postgres/Redis/S3)
   behind an **L4/TCP** load balancer so Caddy still sees SNI and terminates; or (b) move
   custom-domain TLS to **Cloudflare for SaaS** (edge terminates + issues per-customer certs, adds
   CDN/DDoS) and stop managing certs on our nodes.
4. **Scale Postgres.** Read replicas for the renderer read path, then partition/regionalize as
   needed.

### The TLS ↔ load-balancer coupling

The TLS strategy dictates the LB type: Caddy-terminates ⇒ L4 passthrough LB (Caddy needs SNI);
edge/LB-terminates ⇒ the LB must do dynamic per-domain certs (Cloudflare for SaaS / ALB+ACM). Do not
mix these accidentally.

## Consequences

- MVP stays on the simple single-host stack; no premature infrastructure.
- The `caddy_data` local volume is the first thing that must change for multi-node (shared cert
  storage or edge TLS) — flagged so it isn't a surprise.
- Postgres is the central scaling pressure point and the real source of truth; everything else
  (search index when added, assets, certs) is derived/replaceable.
- The M5 domain state machine and `isServableDomain` are proxy-agnostic, so swapping Caddy for an
  edge TLS provider later is additive, not a rewrite.

## Follow-up

- When first running >1 proxy: configure shared CertMagic storage (or adopt Cloudflare for SaaS).
- Add persistent/shared cert storage to the prod compose and gate `isServableDomain` on
  `isCertEligible` (verified/active only) — small hardening, worth doing with the rest of M5.
- Add a CDN in front of the renderer for the public read path.
- Search remains a derived index (rebuildable from Postgres); pick HA/managed only when it earns it.
