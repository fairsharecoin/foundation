# Day 11 — Invite/Access Control Setup (small friend cohort) (v1)

Date: 2026-04-16
Owner: FSC foundation

## Objective
Set a controlled, low-noise access process for the first private alpha cohort.

## Cohort policy (initial)
- Cohort size: 3 to 8 trusted testers
- Invite mode: direct 1:1 only (no public links)
- Expansion rule: only after first triage cycle is stable and no blocker/security issue is open

## Access control procedure

### 1) Candidate list freeze
- Prepare a short invite list with tester handle + channel + status.
- Mark each candidate as: `pending`, `invited`, `active`, `paused`, or `revoked`.
- Freeze list before sending first wave (avoid ad-hoc additions).

### 2) Wave-based onboarding
- Wave 1: invite 2 to 3 testers.
- Wait for first issue cycle + smoke confirmations.
- Wave 2: invite remaining testers only if no stop condition is triggered.

### 3) Invite issuance rules
- Send invite from approved operator account only.
- Include alpha posture text (experimental, reset risk, reporting expectations).
- Provide one canonical reporting path and expected response windows.

### 4) Access revocation and pause
Pause new invites immediately if any stop condition appears:
- data integrity concern
- security/privacy concern
- reproducible transfer inconsistency

Revocation actions:
1. mark tester status `revoked` and record reason/date
2. rotate any shared staging secret if exposed
3. notify tester access is paused pending patch validation

### 5) Communication control
- Keep one operator-facing tracker for cohort state.
- Post only concise alpha updates to testers (no internal debug dump).
- Acknowledge each report with severity and expected follow-up window.

## Minimal operator tracker schema (copy/paste)

| tester | channel | wave | status | invited_at | first_login_at | last_report_at | notes |
|---|---|---:|---|---|---|---|---|
| @example1 | DM | 1 | invited | 2026-04-16 10:00 CET |  |  |  |
| @example2 | DM | 1 | pending |  |  |  |  |

Status values:
- `pending` (selected not invited)
- `invited` (invite sent)
- `active` (confirmed activity)
- `paused` (temporary hold)
- `revoked` (access removed)

## Readiness checks before first invite wave
- [ ] staging URL + HTTPS path validated on external target
- [ ] rollback + backup path confirmed
- [ ] issue intake path reachable and tested
- [ ] operator on-call windows aligned to Day 10 SLA targets

## Day 11 checklist
- [x] Wave policy and invite gating finalized
- [x] Access status model finalized
- [x] Pause/revocation protocol defined
- [x] Operator tracker schema prepared

Status: Day 11 procedure complete (execution depends on Day 9 external HTTPS/domain validation).