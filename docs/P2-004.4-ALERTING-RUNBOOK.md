# P2-004.4 Monitoring + Alerting Baseline Runbook

Status: implemented (2026-03-19)
Owner: Ops/Security

## Objective
Establish minimum viable security alerting for alpha operations, based on existing audit telemetry.

## Alert events (emitted as `event=security_alert`)

### 1) `login_failed_burst` (Auth)
- Trigger source: repeated `login_failed`
- Key: `emailHash`
- Threshold: **5 failures / 10 minutes**
- Severity: `high`
- Typical risks: credential stuffing, account takeover attempt

### 2) `login_rate_limit_burst` (Auth)
- Trigger source: repeated `rate_limit_hit` on `scope=login`
- Key: `dimension + accountHint`
- Threshold: **3 hits / 10 minutes**
- Severity: `high`
- Typical risks: automated brute-force at/over budget ceilings

### 3) `csrf_rejected_burst` (CSRF)
- Trigger source: repeated `csrf_rejected`
- Key: `ip`
- Threshold: **8 rejects / 10 minutes**
- Severity: `medium`
- Typical risks: cross-site request forgery attempts, scripted probing

### 4) `transfer_burst` (Transfer)
- Trigger source: repeated `transfer_success`
- Key: `fromWalletId`
- Threshold: **4 transfers / 10 minutes**
- Severity: `high`
- Typical risks: wallet drain/spam patterns (still bounded by cooldown/rate-limit)

### 5) `email_verification_failed_burst` (Settings)
- Trigger source: repeated `email_verification_failed`
- Key: `walletId`
- Threshold: **5 failures / 10 minutes**
- Severity: `medium`
- Typical risks: token spray/replay attempts

## Triage checklist
1. Confirm alert integrity
   - Look for matching raw events preceding `security_alert`.
   - Validate same key (emailHash/ip/walletHint) across the window.
2. Scope blast radius
   - Single account/IP/device vs distributed pattern.
   - Correlate with `rate_limit_hit`, `login_blocked_delay`, `transfer_success`.
3. Immediate containment
   - If active auth abuse: temporarily tighten login limits and monitor retries.
   - If transfer anomaly: pause suspicious account operationally and review recent transfers.
   - If CSRF burst: validate origin controls and inspect referer/origin patterns.
4. Recovery actions
   - Force password reset/session revocation for impacted account(s) if takeover suspected.
   - Rotate operational credentials only if infrastructure compromise indicators appear.
5. Post-incident
   - Record timeline, root cause, mitigation, and threshold tuning recommendation.

## Synthetic end-to-end validation
Covered by automated API tests:
- repeated missing-CSRF POSTs => emits `security_alert` with `signal=csrf_rejected_burst`
- repeated bad email verification tokens => emits `security_alert` with `signal=email_verification_failed_burst`

Command:
- `npm test`

## Notes
- This baseline is intentionally conservative for alpha.
- Thresholds should be tuned after first real traffic samples.
