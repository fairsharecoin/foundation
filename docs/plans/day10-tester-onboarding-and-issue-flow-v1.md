# Day 10 — Tester Onboarding Pack + Issue Reporting Flow (v1)

Date: 2026-04-16
Owner: FSC foundation

## Deliverable 1: Tester onboarding pack (ready to send)

### A) Welcome message template

Subject: FairShareCoin private alpha access steps

Hey, thanks for joining the FairShareCoin private alpha.

Before you start:
- This is an early experimental build.
- Use test-friendly behavior only (no real-value assumptions).
- Expect occasional resets while we patch.

Access steps:
1. Open the provided alpha URL.
2. Register using your invite email and a strong password.
3. Log in and confirm your wallet dashboard loads.
4. Try one basic transfer flow and review history.

What to focus on:
- Onboarding friction (anything confusing/slow/unclear)
- Transfer clarity and feedback messages
- History readability and trust signals
- Session/logout behavior

How to report issues:
- Use the issue template below (copy/paste).
- Include exact repro steps and expected vs actual result.
- Add screenshot(s) if useful.

Thanks again, your feedback directly shapes the next build.

### B) Tester quick checklist

- [ ] Account created and login successful
- [ ] Wallet overview loaded correctly
- [ ] Transfer happy path completed
- [ ] Cooldown/error messages are understandable
- [ ] History shows expected entries
- [ ] Logout + relogin works

---

## Deliverable 2: Issue reporting flow (single path)

Decision: use one canonical path for early cohort to reduce triage noise.

### Intake channel
- Preferred: GitHub issue (private repo) using `docs/issue-seeds/03-docs-and-onboarding.md` style.
- Fallback: direct message to operator, then operator files issue on behalf of tester.

### Required issue fields
- Title
- Environment (device/browser + approximate timestamp + timezone)
- Repro steps (numbered)
- Expected behavior
- Actual behavior
- Impact (blocker/major/minor)
- Evidence (screenshot/video/log snippet)

### Triage workflow
1. Intake + dedupe check
2. Label severity: blocker / major / minor
3. Assign owner and target patch window
4. Post acknowledgement to tester
5. Close loop with resolution note and retest request

### SLA targets (alpha cohort)
- Blocker: first response <= 2h, mitigation same day
- Major: first response <= 8h, mitigation <= 48h
- Minor: first response <= 24h, batch with next patch cycle

## Day 10 checklist

- [x] Onboarding pack draft finalized
- [x] Reporter template fields finalized
- [x] Triage flow and SLA targets defined
- [x] Linked with existing issue-seed practice

Status: Day 10 deliverables complete.
