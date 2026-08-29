# M5-A5 — Cert-issued → active transition

**Work package:** M5 (Domains and publication routing) — completes the domain lifecycle:
`verified` → `active` when the certificate is actually issued.

## Outcome

A verified custom domain becomes `active` at the moment Caddy issues its on-demand certificate — the
`ask` endpoint is the cert-issuance signal — so the domain's status reflects "cert issued + being
served," not just "DNS confirmed."

## Scope

- `@realtr/core` `approveForCertificate(hostname, repo)` (port-based, unit-tested): approves only
  `verified`/`active` domains and promotes `verified` → `active`; idempotent for already-active;
  denies pending/error/unknown and leaves their state.
- `approveDomainForCertificate(host)` — the singleton-db wrapper over the existing `domain` table.
- `@realtr/db`: `findByHostname` on the domain repository.
- Renderer `internal/tls-check` now calls `approveDomainForCertificate` instead of
  `isServableDomain`, so the on-demand-TLS `ask` both gates issuance and records the transition.

## Non-goals

- Auto-demoting `active` domains when DNS later breaks (needs a flap-resistant policy; excluded, as
  in M5-A4).
- UI status polling to reflect the flip without a refresh.

## Ownership

- `packages/core/src/domains/service.ts` (+ test), `packages/core/src/domains/certificates.ts`,
  `packages/core/src/index.ts`
- `packages/db/src/domains.ts` (`findByHostname`) + integration test
- `apps/renderer/src/routes/internal/tls-check.ts`

## Acceptance criteria

- Approval promotes a verified domain to active exactly once, is idempotent for active, and denies
  non-eligible/unknown hosts without mutating them.
- The gate behaviour of the `ask` endpoint is unchanged (still only verified/active issue certs).
- `check`, `test:unit`, Biome, and `build` pass; the domain-repo integration test covers
  `findByHostname`.

## Verification

- `pnpm --filter @realtr/core run test:unit`, `pnpm -r --parallel check`, `biome check .`,
  `pnpm -r build`
