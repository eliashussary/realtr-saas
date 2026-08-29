# M5-A1 — Domain state machine + DNS verification (foundation)

**Work package:** M5 (Domains and publication routing) — "domain state machine: pending, verifying,
verified, active, error, detached" and "ownership challenge and DNS inspection".

> Built in parallel with other in-flight work. This slice is intentionally **code-only** (pure
> modules in `@realtr/core`, no schema/migration and no edits to shared files) so it merges cleanly
> alongside concurrent branches. Wiring it into the `domain` table transitions, the connect-domain
> UI, and the Caddy on-demand-TLS endpoint are follow-up slices.

## Outcome

A pure, fully unit-tested domain lifecycle state machine and a DNS ownership/pointing verifier that
later M5 slices (verification service, connect UI, TLS gating) build on.

## Scope

- `domains/state-machine.ts`: `DomainState` (pending/verifying/verified/active/error/detached),
  allowed `TRANSITIONS`, `canTransition`/`assertTransition`, `afterVerification`, and the serving/
  cert gates `isServable` (active only) and `isCertEligible` (verified or active).
- `domains/verify.ts`: `verifyDomain` over an injectable `DnsResolver` — ownership via a
  `_realtr-challenge.<host>` TXT token and pointing via a CNAME to the platform host — plus
  `dnsInstructions` for the connect UI. No network in tests.

## Non-goals (later M5 slices)

- Persisting states/transitions on the `domain` row and a background verification job.
- Connect-domain UI (instructions, "verify now", status) and subdomain provisioning.
- Hardening the Caddy on-demand-TLS `ask` endpoint to gate on `isCertEligible`.
- Production URL generation from configured scheme/hosts.

## Ownership

- `packages/core/src/domains/{state-machine,verify}.ts` (+ tests). New files only; no exports wired
  into the package index yet (added when first consumed) to avoid churn on shared files.

## Acceptance criteria

- Legal transitions allowed, illegal + terminal-state transitions rejected; serving/cert gates
  correct.
- `verifyDomain` passes only when ownership + pointing both hold, tolerates resolver errors, and
  explains failures; `dnsInstructions` returns the exact TXT + CNAME records.
- `pnpm --filter @realtr/core run check` and `test:unit` pass.
