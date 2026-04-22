# Day 12 — First Live Private Testing Window + Triage (v1)

Date: 2026-04-16
Owner: FSC foundation

## Goal
Run the first controlled private alpha window and triage findings with same-day clarity.

## Preconditions
- External staging HTTPS/domain path validated
- Wave 1 testers invited (from Day 11 tracker)
- Operator availability aligned with Day 10 SLA targets

## Window plan
- Duration: 90 to 120 minutes
- Suggested shape:
  1. 15 min startup checks (service health + logs)
  2. 60 to 90 min active tester window
  3. 15 min immediate triage sort

## Test script (for testers)
1. Register and login
2. Check wallet overview readability
3. Perform one transfer happy path
4. Trigger one expected guardrail (cooldown or validation error)
5. Confirm history entries
6. Logout and relogin

## Triage protocol (operator)
- Classify every report as blocker/major/minor
- Dedupe by root cause, not by symptom wording
- Open patch tickets with owner + target window
- Send tester acknowledgement with expected follow-up timing

## Exit criteria for Day 12
- [ ] No unresolved blocker remains without mitigation plan
- [ ] All incoming reports have severity + owner
- [ ] Top 3 friction points summarized for Day 13 patching
- [ ] Next regression list prepared from confirmed issues

## Output artifacts
- Triage summary note: `docs/ops/day12-triage-summary-YYYY-MM-DD.md`
- Patch candidate list for Day 13

Status: Prepared (execution gated by external staging HTTPS/domain validation).