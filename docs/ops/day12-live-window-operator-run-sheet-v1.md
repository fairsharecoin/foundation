# Day 12 — Live Private Testing Window Operator Run Sheet (v1)

Date: 2026-04-17
Owner: FSC foundation

Purpose: execute Day 12 quickly and consistently once external staging HTTPS is green.

## Preconditions (hard gate)

- [ ] `https://staging.fairsharecoin.org` is reachable
- [ ] `https://staging.fairsharecoin.org/health` returns `{ "ok": true }`
- [ ] Wave 1 invite/access tracker is ready (Day 11)
- [ ] Operator + backup operator assigned

## T-30 min (before opening window)

- [ ] Confirm staging commit SHA in operator notes
- [ ] Confirm local gate reference is still latest green (build/test/preflight)
- [ ] Start log tail and error monitor
- [ ] Verify incident contact channel and fallback path
- [ ] Prepare triage board columns: blocker / major / minor / question

## T-0 to T+120 min execution

### 1) Startup verification (first 15 min)

- [ ] Register test account
- [ ] Login test account
- [ ] Execute one transfer happy path
- [ ] Trigger one expected guardrail (cooldown or validation)
- [ ] Logout and relogin

### 2) Active tester window (60–90 min)

- [ ] Confirm each incoming issue has template-complete fields
- [ ] Assign temporary severity within 10 minutes of intake
- [ ] Acknowledge tester receipt within SLA target from Day 10
- [ ] Mark duplicates by root cause link

### 3) Immediate triage sort (final 15 min)

- [ ] Final severity set on all reports
- [ ] Owners assigned for blocker/major items
- [ ] Candidate patches listed for Day 13
- [ ] Regression list drafted from confirmed issues

## Mandatory output

Create: `docs/ops/day12-triage-summary-YYYY-MM-DD.md`

Use this template:

```md
# Day 12 Triage Summary (YYYY-MM-DD)

Window start/end:
Environment/commit:
Participants:

## Intake totals
- Total reports:
- Unique root causes:
- Duplicates merged:

## Severity breakdown
- Blocker:
- Major:
- Minor:
- Questions:

## Top 3 friction points
1.
2.
3.

## Day 13 patch candidates
- [ ]
- [ ]
- [ ]

## Immediate mitigations applied
- 

## Risks before next invite wave
- 

## Decision
- [ ] Continue controlled window
- [ ] Hold invite expansion
- [ ] Roll back / pause
```

## Stop conditions (pause window immediately)

- Reproducible data integrity issue
- Authentication/session lockout affecting multiple testers
- Transfer path failure rate >20% in active window
- Any security regression indicating policy bypass

## Hand-off to Day 13

- Export prioritized issue list (blocker/major first)
- Publish patch owner + ETA list
- Freeze new non-critical scope until blocker/major queue clears
