# Docs Index (Canonical)

This directory is the source of truth for FairShareCoin Foundation documentation.

## Folder map

- `alpha/` — alpha readiness gates, exit criteria, tester profile, remint-cycle policy
- `plans/` — short-term plans, sprint scope, rollout planning
- `ops/` — operational runbooks, reports, performance and traceability
- `security/` — threat model, security/privacy plans, hardening matrices
- `issue-seeds/` — ready-to-open issue drafts
- `releases/` — release notes and release snapshots

## Progress tracking files

- `STATUS.md` — now/next/blocked/done snapshot
- `CHANGELOG-PROGRESS.md` — timestamped progress log for humans
- `../PROJECT_PLAN.md` — ticket board and long-form phase history

## Naming conventions

- Use `kebab-case` file names.
- Use `-vN` when versioning a living doc (example: `alpha-exit-checklist-v1.md`).
- Use date suffixes for one-off gates/reports when useful (example: `alpha-rc-gate-2026-04-03.md`).

## Key references

- `alpha/remint-cycle-policy-v1.md` — canonical individualized 100-day remint policy

## Rule of thumb

If a document explains FSC implementation, rollout, readiness, operations, or security: put it under `docs/`.
