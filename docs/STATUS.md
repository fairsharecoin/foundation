# FSC Progress Status

Last updated: 2026-04-17

## Done (recent)

- P2-005.1 open-source release package completed
- P2-005.2 CI security automation baseline completed
- P2-004.4 baseline alert thresholds + ops runbook completed
- Canonical remint policy drafted and locked: `alpha/remint-cycle-policy-v1.md`
- Day 6 follow-up set closed (audit-event matrix, event-sequence assertion, non-enumeration note)
- P2-005.3 publication pack final review completed
- Alpha readiness gate rerun passed: build + 28/28 tests + staging/prod preflight
- Day 9 staging execution run passed (staging-local smoke + restart sanity)
- Day 10 tester onboarding pack + issue reporting flow completed (`docs/plans/day10-tester-onboarding-and-issue-flow-v1.md`)
- Day 11 invite/access control setup completed (`docs/plans/day11-invite-access-control-setup-v1.md`)
- Local validation gate rerun passed on 2026-04-17 (`npm run build`, `npm test`, `npm run preflight:staging`)
- External staging re-check logged (`docs/ops/day9-external-staging-validation-check-2026-04-17.md`)
- Day 12 operator run sheet prepared (`docs/ops/day12-live-window-operator-run-sheet-v1.md`)
- Day 13 patching + targeted regression protocol prepared (`docs/plans/day13-patching-and-regression-checks-v1.md`)
- Day 14 readiness scorecard + decision template prepared (`docs/plans/day14-sprint-review-readiness-scorecard-v1.md`)
- External staging reverse-proxy template prepared (`docs/ops/staging-nginx-vhost-template-v1.md`)

## In progress

- P2-003 account trust + lifecycle enhancements (ongoing)

## Next

- Day 9 HTTPS/domain validation on external staging target
- Day 12 first live private testing window + triage
- Launch first invite wave after external staging HTTPS/domain validation

## Blocked

- Day 9 external staging HTTPS/domain validation: DNS resolves but HTTPS 443 still times out; HTTP serves generic nginx/PHP page (`docs/ops/day9-external-staging-validation-check-2026-04-17.md`)

## Tracking links

- Main ticket board: `../PROJECT_PLAN.md`
- Workspace execution board: `../../TASKS.md`
- Workspace worklog: `../../WORKLOG.md`
