# P2-004.2 CSRF Verification Matrix + Negative Test Coverage

Status: complete (2026-03-12)
Owner: Security/Backend

## Goal
Verify that every mutating endpoint enforces:
1) same-origin checks (`Origin`/`Referer` host must match request host when present)
2) double-submit CSRF token (`fsc_csrf` cookie + `x-csrf-token` header match)

## Mutating endpoint matrix

| Endpoint | Auth required | Same-origin guard | CSRF token guard | Covered by automated negative tests |
|---|---:|---:|---:|---:|
| `POST /register` | No | Yes | Yes | Yes |
| `POST /login` | No | Yes | Yes | Yes |
| `POST /session/ping` | Yes | Yes | Yes | Yes |
| `POST /settings/request-email-verification` | Yes | Yes | Yes | Yes |
| `POST /settings/verify-email` | Yes | Yes | Yes | Yes |
| `POST /settings/change-password` | Yes | Yes | Yes | Yes |
| `POST /logout` | Yes (soft) | Yes | Yes | Yes |
| `POST /transfer` | Yes | Yes | Yes | Yes |
| `POST /cycle/annual-remint` | Yes | Yes | Yes | Yes |

## Test evidence
Implemented in `test/api.security.test.ts`:

- **`CSRF matrix: all mutating endpoints reject missing CSRF header`**
  - Proves all listed mutating endpoints return `400` when the CSRF cookie/header pair is missing or incomplete.

- **`same-origin policy blocks cross-origin POST even with valid CSRF token`**
  - Proves cross-origin requests are blocked even when a valid CSRF token is supplied.

## Validation command

```bash
npm test
```

Expected: all tests pass, including CSRF matrix + same-origin negative tests.
