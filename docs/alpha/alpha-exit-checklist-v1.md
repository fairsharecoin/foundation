# FSC Alpha Exit Checklist v1

Status legend: [ ] pending, [~] in progress, [x] done, [!] blocker
Owner: Denis + Echo

## Sprint kickoff status (Day 1)
- [x] Checklist v1 created
- [x] Scope frozen to hardening-first (UX polish secondary)
- [x] Private invite tester profile/criteria v1 drafted

## A) Auth & Session Safety
- [~] Session expiry behavior verified (idle timeout + reset on activity)
- [~] Session invalidation verified after password change
- [~] Failed login progressive delay verified
- [~] Weak/common password rejection verified
- [~] Session expiry UX is clear and safe (no raw internals shown)

## B) Transfer Integrity & Abuse Controls
- [ ] UUID-only transfer enforcement verified
- [ ] Outgoing transfer cooldown (2 min) enforced under retries/spam
- [ ] Recipient save/update cooldown (5s) enforced
- [ ] Endpoint rate limits hold under burst tests
- [ ] No duplicate or race-condition transfer anomalies observed

## C) Data Integrity & Recovery
- [ ] Clean backup procedure documented and tested
- [ ] Restore into clean environment tested and validated
- [ ] Post-restore consistency check for wallets/ledger/auth passed
- [ ] Recovery runbook written and reproducible

## D) Security Hygiene
- [ ] No sensitive data leaks in user-facing errors
- [ ] Logs/events provide enough auditability for incident triage
- [ ] Secrets/env handling reviewed (no hardcoded secrets)
- [ ] Access controls around admin/maintenance paths verified

## E) Alpha Packaging (Private Invite)
- [ ] Known limitations document prepared for testers
- [ ] Tester onboarding flow documented (how to start + what to test)
- [ ] Bug report template ready
- [x] Private invite cohort criteria defined (size + access method)

## F) Go/No-Go Rule
- [ ] Go/No-Go decision documented with unresolved risk list
- [~] Minimum threshold proposal: all A/B/C must pass; no critical [!] blockers

---

## Notes
- Scope discipline: security/hardening first, UX polish second.
- This checklist is intentionally practical for Phase A closure.
- 2026-04-07 Day 2 start: auth/session verification execution started; baseline test suite run passed (23/23).
