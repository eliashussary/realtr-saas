# M7-A8 — Production email (Resend): magic-link sign-in + lead notifications

**Work package:** M7 / M1 — wires the real email transport that had been a shared stub. This unblocks
**production sign-in** (magic links previously went nowhere in production) and delivers lead
notifications for real.

## Outcome

- `@realtr/core` `sendEmail` sends via **Resend's REST API** (fetch — no SDK dependency) when
  `RESEND_API_KEY` is set; in development it logs the message (so magic links work locally); in
  production without a key it **reports a misconfiguration and sends nothing** (never leaks a magic
  link to logs). Throws on transport failure so callers can surface it. `emailConfigured()` exposes
  readiness.
- **Magic-link sign-in** now routes through `sendEmail` (was a dev-only console log after M7-A5), so a
  real user receives their link in production.
- **Lead notification** is now best-effort: `sendEmail` can throw, so the notify path catches +
  reports (the lead is already stored and separately delivered to the CRM), and the delivery sweep
  guards each lead so one failure never aborts the batch.

## Scope

- `packages/core/src/email.ts` — Resend transport + `emailConfigured`; `RESEND_API_KEY` / `RESEND_FROM`.
  Unit-tested (dev log, prod-misconfig no-leak, configured POST shape, non-2xx throws).
- `packages/core/src/leads-delivery.ts` — best-effort notify + per-lead guard in the sweep.
- `apps/app/src/lib/auth.ts` — `sendMagicLink` sends via `sendEmail`.
- `.env.example` — `RESEND_API_KEY`, `RESEND_FROM` (promoted from "deferred").

## Non-goals

- HTML email templates (text emails for MVP).
- Bounce/complaint webhooks and deliverability tooling (post-launch).

## Ownership

- `packages/core/src/email.ts` (+ test), `packages/core/src/index.ts`,
  `packages/core/src/leads-delivery.ts`, `apps/app/src/lib/auth.ts`, `.env.example`

## Acceptance criteria

- With `RESEND_API_KEY` set, `sendEmail` POSTs to Resend and throws on non-2xx; without it, dev logs
  and prod reports-without-sending (no body in prod logs).
- Magic-link sign-in uses the transport; lead-notification failures never crash the sweep.
- `check`, `test:unit`, Biome, `build` pass.

## Verification

- `pnpm --filter @realtr/core run test:unit` (email transport), `pnpm -r --parallel check`,
  `biome check .`, `pnpm -r build`.
