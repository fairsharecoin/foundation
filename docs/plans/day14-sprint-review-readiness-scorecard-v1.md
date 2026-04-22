# Day 14 — Sprint Review + Readiness Score + Next-Phase Decision (v1)

Date: 2026-04-17
Owner: FSC foundation

## Goal
Make a clear, evidence-based decision on alpha readiness after Day 12 and Day 13 outcomes.

## Inputs
- Day 12 triage summary
- Day 13 patch log + regression results
- Current external staging validation status

## Readiness scorecard (0-2 per area)

- **Environment stability** (0 unstable, 1 mixed, 2 stable)
- **Core user flow reliability** (0 frequent failure, 1 occasional issues, 2 consistently green)
- **Security guardrail integrity** (0 regressions, 1 partial confidence, 2 verified)
- **Operational response quality** (0 unclear ownership, 1 partial SLA, 2 clear + on-time)
- **Issue backlog health** (0 blocker open, 1 majors open, 2 blocker/major controlled)

Total score: `/10`

## Decision bands

- **8-10: GO (controlled expansion)**
  - Continue with next invite wave under existing gates.
- **5-7: HOLD (stabilize first)**
  - Keep cohort fixed, patch remaining risk, re-evaluate.
- **0-4: NO-GO (pause/rollback path)**
  - Stop expansion, apply remediation plan, reassess after evidence.

## Decision record template

```md
# Day 14 Decision Record (YYYY-MM-DD)

Score:
- Environment stability:
- Core user flow reliability:
- Security guardrail integrity:
- Operational response quality:
- Issue backlog health:
- Total:

Decision: GO / HOLD / NO-GO

Rationale:
- 

Conditions (if GO):
- 

Required fixes before next re-check (if HOLD/NO-GO):
- 

Owner + next review date:
- 
```

## Required outputs
- `docs/ops/day14-decision-record-YYYY-MM-DD.md`
- Updated status line in `docs/STATUS.md`
- Short summary in daily report (progress, hiccups, expected)
