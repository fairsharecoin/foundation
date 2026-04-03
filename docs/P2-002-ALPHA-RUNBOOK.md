# P2-002 Controlled Public Alpha — Runbook (v0)

Date: 2026-03-03

## Goal
Create a repeatable, low-risk path for staging and public-alpha deployments with rollback.

## Environment split

- **local**: developer machine, rapid iteration (`NODE_ENV=development`)
- **staging**: pre-alpha validation (`NODE_ENV=staging`)
- **production**: public alpha (`NODE_ENV=production`)

Use separate env files and separate DB paths per environment.

## Script entry points

- Build: `npm run build`
- Staging run: `npm run start:staging`
- Production run: `npm run start:prod`
- Staging preflight gate: `npm run preflight:staging`
- Production preflight gate: `npm run preflight:prod`

## Preflight checklist (must pass)

1. Code checks
   - `npm test` passes
   - `npm run build` passes
2. Config checks
   - Correct env file loaded for target env
   - `FSC_UI_DEBUG=0` in staging/prod
   - DB path points to env-specific location (no sharing)
3. Safety checks
   - Backup current DB/snapshot
   - Confirm rollback artifact is available (last known good build)
4. Smoke checks (post-start)
   - GET `/` loads
   - Register/login/transfer/logout basic path works
   - CSRF-protected route rejects invalid token

## Deploy (staging/prod)

1. Pull target revision
2. Install deps: `npm ci`
3. Build: `npm run build`
4. Restart service with target env (`start:staging` or `start:prod`)
5. Run smoke checks

## Rollback procedure

Trigger rollback if:
- login/register broken
- transfer path broken
- severe security regression
- persistent 5xx rate spike

Rollback steps:
1. Stop current service
2. Restore previous release artifact
3. Restore last known good DB snapshot if migration/data issue
4. Start previous release
5. Re-run smoke checks
6. Record incident + root cause candidate

## Operational guardrails for public alpha

- Keep feature set minimal (avoid exposing experimental admin/debug paths)
- Rotate demo accounts/fixtures regularly
- Track auth failure bursts and transfer anomaly spikes
- Require explicit sign-off before widening public exposure

## Evidence log

### 2026-03-05 — Staging smoke pass (strict)
- Environment: `NODE_ENV=staging`, `FSC_UI_DEBUG=0`, isolated DB path (`/tmp/fsc-staging-alpha.db`)
- Result: PASS
- Verified:
  - `GET /` returns 200
  - register (wallet A + wallet B)
  - login (wallet A)
  - transfer from A -> B
  - logout
  - CSRF negative path (`POST /register` with invalid token) returns 400

### 2026-03-05 — Rollback drill
- Known-good artifact: compiled `dist/` from current revision + staging DB snapshot (`/tmp/fsc-staging-alpha.db.bak`)
- Simulated bad deploy: attempted staging start without required `FSC_DB_PATH` (expected boot failure)
- Rollback action: restored known-good DB snapshot and restarted with known-good env (`NODE_ENV=staging`, `FSC_DB_PATH=/tmp/fsc-staging-alpha.db`)
- Post-rollback smoke: `GET /health` returned `{ ok: true }`
- Result: PASS
