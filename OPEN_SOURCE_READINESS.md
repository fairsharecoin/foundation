# Open Source Readiness (P2-005.1)

Last updated: 2026-04-03

## Scope
This document defines what is safe to publish now, what must be excluded, and the release gate before publishing a public alpha repository.

## 1) Public now (safe to publish)
- Source code under `src/`, `test/`, `scripts/`, and `docs/`
- Build/test configuration (`package.json`, `tsconfig.json`)
- Environment templates (`.env.example`, `.env.staging.example`, `.env.production.example`)
- Deployment and operations runbooks that do not contain secrets

## 2) Must be removed/redacted before public push
- Any real `.env` files (non-example)
- Local database files and runtime artifacts (`data/*.db`, logs, crash dumps)
- Personal machine paths or operator-specific notes that expose private infrastructure details
- Any credential material (tokens, API keys, SMTP credentials, webhook secrets)

## 3) Known current limitations (alpha)
- Foundation app remains a centralized operational deployment model for now
- Email verification exists, but production-grade mail delivery hardening is still environment-dependent
- Decentralized settlement/consensus layer is not yet wired into runtime path
- Governance/process docs are baseline only and will evolve with contributors

## 4) Risk posture for public alpha
- Security baseline is materially improved (CSRF matrix, rate-limit budgets, threat model, alerting runbook)
- Residual risk remains medium until:
  - external review of threat model and controls
  - dependency/SBOM checks are automated in CI
  - operational secret handling is validated in real hosted environment

## 5) Pre-publish checklist
- [ ] No non-example `.env*` files committed
- [ ] No secrets found by repository scan
- [ ] No SQLite runtime DB artifacts committed
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run preflight:staging` passes
- [ ] `npm run preflight:prod` passes
- [ ] README reflects alpha scope and limitations
- [ ] LICENSE + CONTRIBUTING + CODE_OF_CONDUCT + SECURITY present

## 6) Alpha release-candidate gate outcome
See: `docs/alpha/alpha-rc-gate-2026-04-03.md`

Status: **Prepared** (documentation + governance + checks executed). Final public push remains an explicit operator decision.
