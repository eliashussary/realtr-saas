# Agent task packets

This directory turns the milestones in `docs/EXECUTION_PLAN.md` into bounded work that an agent can
execute with fresh context. The execution plan owns product sequencing; these packets own the
implementation contract for one slice.

## Required reading order

Every assigned agent starts by reading, in order:

1. `AGENTS.md`
2. `README.md`
3. this file
4. the assigned task packet
5. every ADR or source file listed under that packet's **Required context**

Do not assume conversational context, undocumented decisions, or the state of another agent's
worktree. Inspect the repository and git status before acting.

## Status vocabulary

- `ready`: dependencies are present and the task may be dispatched
- `blocked`: a named dependency or decision is missing
- `in progress`: one agent owns the task; do not dispatch a second agent onto it
- `review`: implementation is complete but acceptance evidence has not been approved
- `done`: acceptance criteria and handoff evidence have been approved

Only the coordinating agent or product owner changes task status. An implementing agent reports
evidence; it does not declare its own packet approved.

## Initial queue

| Order | Packet | Status | Depends on | Parallelism notes |
|---:|---|---|---|---|
| 1 | [M0-C1 Test foundation](M0-C1-test-foundation.md) | done | — | Canonical commands and two-tenant fixtures established |
| 2 | [M0-A1 Authorization guard](M0-A1-authorization-guard.md) | done | M0-C1 | Shared authorization contract and cross-tenant tests established |
| 3 | [M0-A2 Secure domain mutations](M0-A2-secure-domain-mutations.md) | review | M0-A1 | Implementation verified; manual flow evidence remains |
| 4 | [M0-E1 Listing identity migration](M0-E1-listing-identity-migration.md) | done | M0-C1 | Tenant-scoped constraint and regression tests established |
| 5 | [M0-F1 Worker lifecycle](M0-F1-worker-lifecycle.md) | ready | M0-C1 | Avoid DB schema changes unless coordinated |
| 6 | [M0-G1 UI system spike](M0-G1-ui-system-spike.md) | ready | ADR 0001 | May run beside backend tasks; owns UI manifests/config |
| 7 | [M3-D1 DDF discovery brief](M3-D1-ddf-discovery-brief.md) | done | — | Production DDF client/model blocked on CREA answers |
| 8 | [M2-D1 Draft/publish ADR](M2-D1-draft-publish-adr.md) | review | — | Proposed ADR is ready for product-owner decision |
| 9 | [M0-D1 CI baseline](M0-D1-ci-baseline.md) | blocked | C1 and stable root scripts | Dispatch after test commands settle |

Dependencies take precedence over the numeric order. M0-E1 and M0-F1 may start after M0-C1 while
M0-A1/A2 proceeds. M0-G1, M3-D1, and M2-D1 are intentionally parallel tracks.

## Dispatch prompt

Use this minimal prompt so the repository remains the source of truth:

```text
Read AGENTS.md, README.md, docs/agent-tasks/README.md, and
docs/agent-tasks/<PACKET>. Execute that packet only. Inspect current repository state first,
respect its dependencies and ownership boundaries, and return the required handoff evidence.
Do not mark the task done yourself.
```

If the task is running concurrently, append the names of active packets and any explicitly reserved
files. Never ask two agents to generate migrations, route trees, lockfile changes, or edits to the
same shared registry simultaneously.

## Packet contract

Every packet defines:

- **Outcome**: the observable result, not an activity
- **Why now**: its place in the dependency graph
- **Required context**: exact decisions and code to inspect
- **Dependencies**: repository state that must already exist
- **Scope**: required work
- **Non-goals**: tempting work explicitly excluded
- **Ownership**: expected files plus shared-file collision warnings
- **Constraints**: task-specific invariants beyond `AGENTS.md`
- **Acceptance criteria**: evidence required for review
- **Verification**: commands and manual cases
- **Handoff**: the response format expected from the agent

An agent may adjust file placement when repository evidence demands it, but must explain the change
and preserve the packet's boundaries. If a missing decision would materially change architecture,
stop and report it rather than silently choosing a broad direction.

## Standard handoff

Every agent response must include:

1. outcome summary
2. files changed
3. acceptance criteria with evidence for each item
4. commands run and their exact pass/fail outcome
5. manual checks performed
6. security/tenant-isolation considerations
7. migrations, environment variables, or operator actions introduced
8. remaining risks, open decisions, and follow-up work now unblocked

If verification hangs or cannot run, report where it stopped, how long it was allowed to run, and
what narrower checks passed. Silence is not a pass.
