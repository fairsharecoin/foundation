# Day 8 — Repo Visibility Strategy + Invitation Draft (v1)

Date: 2026-04-13
Owner: FSC foundation

## Repo visibility strategy (recommended)

Decision: keep codebase **private during first invite alpha**, then move toward public visibility with staged hardening.

### Why private first
- Reduces noise while core alpha feedback loop is being established.
- Limits early attack surface while monitoring/ops maturity is still lightweight.
- Keeps tester communication and issue handling focused.

### Transition path to openness
1. **Alpha private (now):** invite-only testers, direct issue intake.
2. **Pre-public prep:** sanitize docs, add threat-model summary, finalize deploy/incident basics.
3. **Public technical preview:** publish repo/read-only docs with clear "experimental" posture.

## Private invite message draft (v1)

Subject: FairShareCoin private alpha invite

Hey, we’re opening a small private alpha for FairShareCoin.

What this is:
- Early testing of wallet basics (login, balance, transfer flow, history).
- Limited cohort, short feedback loops, and fast fixes.

What we need from you:
- Try normal usage and edge cases.
- Report bugs clearly (steps, expected behavior, actual behavior, screenshots if useful).
- Share friction points in onboarding and transfer UX.

Current scope notes:
- This is still experimental.
- Access is invite-only and may be reset as we patch.

If you’re in, we’ll send access steps and reporting format.

Thanks for helping shape this early.

## Day 8 checklist
- [x] Visibility strategy documented
- [x] Invite draft v1 written
- [x] Final sign-off on wording
- [x] Prepare Day 9 environment execution checklist

## Day 9 environment execution checklist (prepared)

1. Confirm `.env.production` values for target host (including `FSC_DB_PATH`, `FSC_UI_DEBUG=0`).
2. Run backup before deployment (`npm run db:backup`) and confirm backup artifact exists.
3. Deploy latest build and restart service.
4. Execute smoke checks:
   - login/register
   - wallet fetch
   - transfer happy path
   - transfer cooldown behavior
   - logout/session re-login
5. Verify logs for CSRF/rate-limit noise and obvious runtime exceptions.
6. Keep rollback command and previous backup path ready.

Status: Day 8 deliverables complete.
