# FairShareCoin Foundation — Ticket Board

_Status legend:_ ⬜ not started · 🟨 in progress · ✅ done

## Phase 1 — Hardening to Final Working State (FWS)

### P1-001 Stability sweep (all existing flows)
- Status: ✅
- Scope:
  - Register → Login → Dashboard → Transfer → History → Settings → Logout
  - Full Recipients window + Full History window
- Done when:
  - No blocker runtime/UI errors in tested flows

### P1-002 Fix remaining bugs from sweep
- Status: ✅
- Scope:
  - Patch defects found in P1-001
  - Add regression notes per fix
- Done when:
  - All P1-001 defects are closed or explicitly deferred

### P1-003 CSRF protection on mutating endpoints
- Status: ✅
- Scope:
  - Add CSRF token strategy
  - Apply to POST endpoints (`/register`, `/login`, `/logout`, `/transfer`, `/settings/change-password`, `/session/ping`, `/cycle/annual-remint` as appropriate)
- Done when:
  - Mutating routes reject missing/invalid CSRF token where intended

### P1-004 Session/cookie hardening pass
- Status: ✅
- Scope:
  - Recheck cookie flags (httpOnly, sameSite, secure in prod)
  - Validate session expiry + invalidation behavior
- Done when:
  - Session behavior matches policy and is verified by tests/manual checks

### P1-005 Server-side validation consistency
- Status: ✅
- Scope:
  - Ensure strict validation on all inputs and query params
  - Harmonize error responses for invalid input
- Done when:
  - No unvalidated request path remains in current feature scope

### P1-006 Integration tests (core happy paths)
- Status: ✅
- Scope:
  - Register, login, logout
  - Transfer success path
  - Recipient save/update
  - History retrieval
  - Password change
- Done when:
  - Test suite green on fresh DB

### P1-007 Negative/security tests
- Status: ✅
- Scope:
  - Invalid UUID/amount
  - Expired session
  - Cooldown/rate-limit enforcement
  - Forbidden wallet access
- Done when:
  - Expected failures are asserted and passing

### P1-008 Regression test pack for known issues
- Status: ✅
- Scope:
  - Include full-history window rendering (`esc` bug)
  - Add tests for any newly fixed bugs
- Done when:
  - Repro cases are automated and passing

### P1-009 Audit logging baseline
- Status: ✅
- Scope:
  - Log auth success/fail, transfers, password changes, logout/session expiry
  - Include timestamp + wallet/session identifiers (no secret leakage)
- Done when:
  - Logs are structured + readable for troubleshooting

### P1-010 Docs + runbook refresh
- Status: ✅
- Scope:
  - README, `.env.example`, startup/run instructions
  - Known limitations + trust assumptions
- Done when:
  - Fresh setup from docs works end-to-end

### P1-011 Phase 1 exit gate (FWS sign-off)
- Status: ✅
- Checklist:
  - [x] Core flows stable; no known blocker bugs
  - [x] Security baseline in place
  - [x] Core + negative tests passing
  - [x] Audit logs active
  - [x] Fresh setup validated from docs
- Done when:
  - All checklist items are checked and signed off

---

## Phase 2 — Brief Overview Tickets

### P2-001 Identity verifier adapter finalization
- Status: ✅
- Outcome:
  - Clean seam for real NFC/ePassport + ICAO verification integration

### P2-002 Controlled public alpha environment
- Status: 🟨
- Outcome:
  - Staging/prod split, deployment pipeline, rollback path

### P2-003 Account trust + lifecycle enhancements
- Status: 🟨
- Outcome:
  - Email verification/re-verification, improved session/account controls

### P2-004 Security + monitoring uplift
- Status: 🟨
- Outcome:
  - Threat-model pass, expanded abuse detection, monitoring + alerts

### P2-005 Open-source/decentralization prep
- Status: 🟨
- Outcome:
  - Public repo quality, contribution docs, architecture roadmap

---

## Progress Log

- 2026-02-27: Ticket board created.
- 2026-02-27: P1-003 done (double-submit CSRF token + same-origin enforcement on POST routes).
- 2026-02-27: P1-004 done (cookie policy helper, prod Secure flag, consistent session cookie handling).
- 2026-02-27: P1-009 done (structured audit logs for register/login fail+success/transfer/password-change/logout/session-expiry).
- 2026-02-27: Fixed full history `esc is not defined` bug and rebuilt dist.
- 2026-02-27: Baseline checks green: npm test (7/7), npm run build.
- 2026-02-27: Added API security tests (`test/api.security.test.ts`) for CSRF reject/accept paths.
- 2026-02-27: Fixed build/runtime path mismatch by pointing start scripts to `dist/src/api/server.js`.
- 2026-02-27: Current suite green: npm test (9/9), npm run build.
- 2026-02-27: README refreshed (scripts, security notes, run path updates).
- 2026-02-27: Added happy-path + negative API tests (forbidden wallet access, cooldown enforcement, invalid transfer amount, logout auth loss).
- 2026-02-27: Added regression test to assert `/history` includes `function esc(s)`.
- 2026-02-27: Added `.env.example` and completed docs/runbook baseline.
- 2026-02-27: FWS gate marked complete; Phase 1 tickets all closed.
- 2026-02-27: Phase 2 kickoff started; P2-001 set to in progress.
- 2026-02-27: P2-001 complete: added identity verifier adapter seam (`src/core/identityVerifier.ts`), wired register flow through verifier, exposed verification metadata, and added verifier + API coverage tests.
- 2026-03-10: P2-003.2 complete: settings UI now exposes email verification status + request/confirm actions; wallet state wiring updated; build/tests green.
- 2026-03-10: P2-004.1 draft complete: threat model document created at `docs/security/p2-004-threat-model.md` with ranked risks, owners, and mitigation sequence.
- 2026-03-12: P2-004.2 complete: added CSRF verification matrix doc (`docs/security/p2-004-2-csrf-verification-matrix.md`) and expanded negative security tests to assert missing-CSRF rejection across all mutating endpoints plus explicit cross-origin POST blocking.
- 2026-03-12: P2-004.3 complete: introduced endpoint-specific dimensional rate budgets (`ip`/`account`/`device`) for key routes and added structured `rate_limit_hit` telemetry labels in audit output (`docs/security/p2-004-3-dimensional-budgets-telemetry.md`).
- 2026-03-19: P2-004.4 complete: added baseline security-alert emission (`security_alert`) for login/CSRF/transfer/email-verification abuse signals, added CSRF + email-verification failure telemetry events, validated alert paths with synthetic end-to-end tests, and documented triage in `docs/security/p2-004-4-alerting-runbook.md`; build/tests green (21/21).
