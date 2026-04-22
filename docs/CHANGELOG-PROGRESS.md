# Progress Changelog

## 2026-04-17

- Re-checked Day 9 external staging path and logged results:
  - `docs/ops/day9-external-staging-validation-check-2026-04-17.md`
  - DNS resolves, HTTP serves generic nginx/PHP page, HTTPS 443 still times out.
- Re-ran local readiness validation gate:
  - `npm run build` PASS
  - `npm test` PASS (28/28)
  - `npm run preflight:staging` PASS
- Completed unblocked Day 12-14 readiness prep work:
  - Day 12 live window operator run sheet + triage summary template:
    - `docs/ops/day12-live-window-operator-run-sheet-v1.md`
  - Day 13 patching + targeted regression protocol:
    - `docs/plans/day13-patching-and-regression-checks-v1.md`
  - Day 14 readiness scorecard + GO/HOLD/NO-GO decision template:
    - `docs/plans/day14-sprint-review-readiness-scorecard-v1.md`
- Added practical staging reverse-proxy template to accelerate Day 9 closure:
  - `docs/ops/staging-nginx-vhost-template-v1.md`
- Updated tracking surfaces to reflect current state:
  - `docs/STATUS.md`
  - `docs/plans/2-week-plan-overview-v1.html`
  - `docs/README.md`

## 2026-04-16

- Completed Day 10 deliverables and published:
  - `docs/plans/day10-tester-onboarding-and-issue-flow-v1.md`
  - includes tester welcome template, quick checklist, canonical issue intake path, triage workflow, and alpha SLA targets.
- Updated 2-week overview board:
  - Day 10 marked done
  - last-updated timestamp refreshed
- Completed Day 11 invite/access-control setup and published:
  - `docs/plans/day11-invite-access-control-setup-v1.md`
  - includes wave-based invite gating, tester status model, pause/revocation protocol, and operator tracker schema.
- Updated 2-week overview board again:
  - Day 11 marked done
  - counters/timestamp refreshed
- Prepared Day 12 execution playbook:
  - `docs/plans/day12-private-testing-window-and-triage-v1.md`
  - includes preconditions, window shape, tester script, triage protocol, and exit criteria.

## 2026-04-14

- Closed Day 6 follow-up set and captured closure in docs/tests:
  - endpoint -> audit-event matrix
  - `login_failed` -> `login_blocked_delay` sequence assertion
  - non-enumerating error policy note
- Finalized Day 8 repo visibility strategy + private invite draft sign-off; added Day 9 execution checklist.
- Added alpha readiness gate report: `docs/alpha/alpha-readiness-gate-2026-04-14.md`.
- Re-ran full quality gate:
  - build PASS
  - tests PASS (28/28)
  - staging preflight PASS
  - production preflight PASS
- Executed Day 9 staging-local environment run:
  - strict staging start
  - smoke flow PASS (register/login/transfer/ping/logout/relogin)
  - restart sanity PASS (/health 200)
  - report: `docs/plans/day9-staging-execution-report-2026-04-14.md`

## 2026-04-08

- Started docs hygiene reorganization using belt-and-suspenders flow:
  1. Copy into canonical folders first
  2. Verify references and report paths
  3. Remove legacy duplicates only after verification
- Added canonical docs structure folders: `alpha/`, `plans/`, `ops/`, `security/`
- Added docs index and progress tracking files:
  - `docs/README.md`
  - `docs/STATUS.md`
  - `docs/CHANGELOG-PROGRESS.md`
- Copied 2-week plan into repo docs:
  - `docs/plans/2-week-plan-overview-v1.html`

Notes:
- This changelog is human-facing and meant to reduce reporting ambiguity.
