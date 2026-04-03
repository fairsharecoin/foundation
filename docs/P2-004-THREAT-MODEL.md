# P2-004.1 Threat Model (Auth, Transfer, Settings)

Status: draft-v1 (2026-03-10)
Owner: Security/Backend

## Scope
- Authentication: register, login, logout, session ping
- Transfer flow: send transfer, recipient lookup/save metadata, history reads
- Settings flow: change password, email verification request/confirm

## Assets
- Wallet balances + transfer history integrity
- Account access (session cookies, credentials)
- Email verification state
- Identity issuance uniqueness (coinMintId path)
- Audit logs and security telemetry

## Trust boundaries
1. Browser ↔ API server (untrusted client input)
2. Session and CSRF cookies ↔ API auth checks
3. API server ↔ SQLite state store
4. App/UI debug surfaces ↔ production users

## Attacker profiles
- A1 Anonymous internet actor (no account)
- A2 Authenticated malicious user (has account)
- A3 Automated abuse actor (botnet/scripted retries)
- A4 Opportunistic insider with log access

## Key threats and mitigations

| ID | Threat | Surface | Likelihood | Impact | Risk | Current controls | Gaps / next actions |
|---|---|---|---|---|---|---|---|
| T1 | Credential stuffing / brute-force login | /login | High | High | Critical | Progressive delay, per-endpoint dimensional rate limits, bcrypt hashes, audit events | Add alert thresholds + lockout telemetry dashboard (P2-004.4) |
| T2 | CSRF against mutating endpoints | register/login/logout/transfer/settings | Medium | High | High | same-origin + CSRF token on mutating routes | Add explicit endpoint matrix doc + regression pack (P2-004.2, P2-004.5) |
| T3 | Session hijack/replay | session cookie | Medium | High | High | HttpOnly cookie, SameSite=Lax, idle timeout (15m), session invalidation on password change | Evaluate optional IP/device binding strictness and anomaly alerts |
| T4 | Transfer abuse bursts (drain / spam) | /transfer | Medium | High | High | transfer cooldown, dimensional rate limits, strict amount/UUID validation | Add suspicious burst alerting + operational runbook (P2-004.4) |
| T5 | Verification token abuse (spray/replay) | settings verify | Medium | Medium | Medium | UUID token, expiry TTL (5m), request/confirm rate limits | Add alerting on repeated failed verify attempts |
| T6 | Identifier correlation leakage (UUID+email) | UI/logs/docs | Medium | Medium | Medium | masked defaults, settings-scoped email, debug gate | Add screenshot/docs hygiene checklist for alpha publishing |
| T7 | Sensitive debug data exposure in prod UI | debug panel | Low | Medium | Medium | FSC_UI_DEBUG flag, debug hidden by default | Add startup sanity check to fail if debug enabled in production |
| T8 | Data tampering/corruption at rest | SQLite | Low | High | Medium | normalized tables, migrations, tests | Add DB backup/restore + integrity check runbook |
| T9 | Enumeration via lookup/read endpoints | wallet/lookup/history | Medium | Medium | Medium | account-scoped checks, rate limits, auth required | Add per-endpoint tighter budgets and monitoring |

## Prioritized actions
1. **P2-004.2** Build and document CSRF verification matrix + negative cross-origin tests.
2. **P2-004.3** Expand endpoint-specific dimensional budgets (IP+account+device) and telemetry labels.
3. **P2-004.4** Add baseline alert thresholds:
   - login failures burst (per IP + per account)
   - repeated CSRF rejects
   - transfer burst anomalies per wallet
   - email verification failures burst
4. **P2-004.5** Add security regression pack covering T1/T2/T4/T5/T9 paths.

## Owner mapping
- Backend owner: endpoint controls, validation, limits, session policy
- Frontend owner: safe UX defaults, no sensitive debug exposure
- Ops owner: alerting, triage runbook, incident checklist

## Exit criteria for P2-004.1
- Threats documented with risk ranking and named mitigations
- Owner + next action assigned for each High/Critical risk
- Plan aligned with P2-004.2 → P2-004.5 work breakdown
