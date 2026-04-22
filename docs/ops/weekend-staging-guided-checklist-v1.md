# Weekend Staging Guided Checklist (v1)

Purpose: run the external staging validation safely and quickly with step-by-step checks.

Use this when you are ready to expose FSC staging at `staging.fairsharecoin.org`.

## 0) Safety first (do before changes)

1. Confirm current branch/commit:
   ```bash
   git status --short --branch
   git log --oneline -n 3
   ```
2. Create backup:
   ```bash
   npm run db:backup
   ```
3. Keep rollback artifact available (last known-good `dist/` + latest backup metadata).

## 1) Local gate (must be green)

Run from repo root:

```bash
npm ci
npm run build
npm test
npm run preflight:staging
```

Required result: all pass.

## 2) Staging env baseline

Minimum env for staging service:

- `NODE_ENV=staging`
- `PORT=4011` (or your chosen staging app port)
- `FSC_DB_PATH=<staging-only db path>`
- `FSC_UI_DEBUG=0`

Never share DB path with local dev or production.

## 3) Reverse proxy wiring (nginx/Caddy)

Goal:
- `staging.fairsharecoin.org:443` -> reverse proxy -> FSC app on staging port
- HTTP 80 should redirect to HTTPS (or be intentionally closed)

Proxy checklist:
- Hostname matches `staging.fairsharecoin.org`
- Upstream points to correct app port
- `X-Forwarded-Proto` and `Host` headers forwarded
- TLS cert configured for staging domain

## 4) DNS + TLS verification

Run checks:

```bash
dig +short staging.fairsharecoin.org
curl -I http://staging.fairsharecoin.org
curl -I https://staging.fairsharecoin.org
curl -sS https://staging.fairsharecoin.org/health
```

Expected:
- DNS resolves to intended host
- HTTP gives redirect (301/308) or controlled behavior
- HTTPS responds (no timeout)
- `/health` returns `{ "ok": true }`

## 5) External smoke flow (real domain)

Via browser on staging domain:

1. Register account A
2. Register account B
3. Login as A
4. Transfer A -> B
5. Session ping check
6. Logout
7. Relogin

Required: no blocker errors in main user path.

## 6) Security quick checks

1. Invalid CSRF on mutating route should fail (400)
2. Session timeout behavior still consistent
3. Cooldown/rate-limit responses remain user-safe and non-leaky

## 7) Decision gate

Proceed only if all below are true:
- Local gate green
- HTTPS works on staging domain
- Smoke flow green
- Security quick checks green
- Rollback path verified and ready

Then mark staging external validation complete.

## 8) If broken, rollback immediately

Rollback trigger examples:
- login/register broken
- transfer broken
- persistent 5xx / severe instability
- security regression

Rollback steps:
1. Stop current service
2. Restore known-good artifact
3. Restore latest known-good DB backup when needed
4. Restart staging service
5. Re-check `/health` + login path

## 9) Operator log template

Copy/paste and fill:

```text
Date/time:
Operator:
Commit:
DNS check:
HTTPS check:
Health check:
Smoke flow:
Security quick checks:
Decision (GO / HOLD / ROLLBACK):
Notes:
```

---

References:
- `docs/P2-002-ALPHA-RUNBOOK.md`
- `docs/plans/day9-staging-execution-report-2026-04-14.md`
- `docs/alpha/alpha-readiness-gate-2026-04-14.md`
- `docs/ops/backup-restore-runbook-v1.md`
