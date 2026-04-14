# Error Surface Review — 2026-04-08

Scope: API-facing `FSCError` messages and audit/telemetry event trail behavior in `src/api/server.ts`.

## Findings (quick pass)

- Auth failures return generic user-safe text (`invalid email or password`) with retry timing.
- Session failures are concise (`not authenticated`, `session expired`).
- Security controls return bounded, user-safe guidance:
  - CSRF failures
  - same-origin policy blocks
  - rate-limit wait durations
  - transfer cooldown wait durations
- No direct stack traces or raw internal exception dumps are surfaced in normal API error paths.

## Event trail notes

- Security-significant routes emit audit events for key actions/failures:
  - login success/failure
  - session expiration
  - CSRF rejection bursts (`security_alert` baseline)
  - email verification failure bursts (`security_alert` baseline)
  - password change
  - logout
- Existing telemetry labels include scope/dimension/wait for rate-limit hits.

## Operator-facing endpoint → audit event matrix (compact)

| Endpoint | Method | Success event(s) | Failure / control event(s) |
|---|---|---|---|
| `/register` | POST | `register_success` | `csrf_rejected`, `rate_limit_hit` |
| `/login` | POST | `login_success` | `login_failed`, `login_blocked_delay`, `rate_limit_hit` |
| `/session/ping` | POST | (none, keepalive only) | `csrf_rejected`, `session_expired`, `rate_limit_hit` |
| `/settings/request-email-verification` | POST | `email_verification_requested` | `csrf_rejected`, `rate_limit_hit` |
| `/settings/verify-email` | POST | `email_verified` | `email_verification_failed`, `csrf_rejected`, `rate_limit_hit` |
| `/settings/change-password` | POST | `password_changed` | `csrf_rejected`, `session_expired`, `rate_limit_hit` |
| `/logout` | POST | `logout` | `csrf_rejected` |
| `/transfer` | POST | `transfer_success` | `csrf_rejected`, `rate_limit_hit` |

## Non-enumerating user-error policy note

User-facing auth/security errors should remain non-enumerating. This means responses must not reveal whether a specific account exists, or expose internal state details that help targeted probing. Keep wording user-safe and operationally useful (for example, bounded wait hints), while preserving detail in audit events for operators.

## Follow-up closure (Day 5 continuation)

1. ✅ Added compact endpoint/audit-event matrix (above).
2. ✅ Added integration assertion for `login_failed` -> `login_blocked_delay` sequence (`test/api.security.test.ts`).
3. ✅ Added explicit non-enumerating error policy note (above).

Status: No immediate blocker found in this pass.
