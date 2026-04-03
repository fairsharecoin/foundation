# FairShareCoin Foundation

FairShareCoin is a human-fair monetary system built around identity uniqueness, recoverability, and long-term balance.

A local-first alpha foundation for FairShareCoin wallet/account flows and security controls.

## At a glance

- One person ↔ one identity lineage in the system (no mining model)
- Value model is human-centered and fairness-oriented
- Identity-backed account continuity with recovery-oriented design

## Minimal flow

Register → identity uniqueness check path (future ICAO integration) → wallet/account activation → send/receive value → recover account continuity if access is lost

## Example (illustrative)

You help someone for 10 minutes and receive a small FSC fraction. You keep that value over time under the same fairness rules used for everyone else.

## Status: Alpha (local-first)

- Not production-ready
- No real ICAO/NFC identity verification live yet
- No decentralized consensus runtime live yet

> This repository is an implementation foundation, not the final decentralized protocol runtime.

## What this repo is

- Working app flow: register/login, wallet overview, transfer, recipients, history, settings
- UUID-only transfer routing (`walletId -> walletId`)
- SQLite-backed persistence for auth + ledger state
- Session/auth hardening (password policy, session timeout, progressive login delay)
- CSRF protection + rate limiting + cooldown controls
- Verification lifecycle scaffolding and security telemetry basics

## What this repo is not (yet)

- Production decentralized settlement/consensus network
- Real ICAO/NFC identity verification in live mode
- Final cryptographic protocol implementation

This is the practical foundation layer used to validate product/security behavior ahead of broader protocol decentralization.

## Quick start

```bash
npm install
npm run dev
```

App default: `http://localhost:4010`

## Production-style local run

```bash
npm run build
npm run start:prod
```

## Scripts

- `npm run dev` — run TS server in watch mode
- `npm run build` — compile to `dist/`
- `npm run start` — run compiled server
- `npm run start:staging` — run with `NODE_ENV=staging`
- `npm run start:prod` — run with `NODE_ENV=production`
- `npm run preflight:staging` — strict staging preflight gate
- `npm run preflight:prod` — strict production preflight gate
- `npm test` — test suite

## Security and operational notes

- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production mode
- CSRF on mutating routes (double-submit + same-origin checks)
- Endpoint-level rate limits and cooldown controls
- In staging/production, `FSC_DB_PATH` is required (fail-fast if missing)

## Data model clarity

- Canonical transfer identifier: `transferId` (ledger entry UUID generated server-side)
- Recipient nickname/email are local contact metadata only, not transfer addressing

## Documentation

- `OPEN_SOURCE_READINESS.md` — publish boundaries, risks, and release checklist
- `docs/ALPHA_RC_GATE_2026-04-03.md` — alpha readiness gate evidence
- `docs/DECENTRALIZATION_MIGRATION_MAP.md` — centralized-now to decentralized-target mapping
- `SECURITY.md` — vulnerability reporting policy
- `CONTRIBUTING.md` — contribution workflow
- `CODE_OF_CONDUCT.md` — community standards

## Clean removal / uninstall (local)

If you want to fully remove this local foundation app from your machine:

```bash
# from repo root
# 1) stop any running dev/prod process first (Ctrl+C if foreground)

# 2) one-command local cleanup (includes node_modules, dist, data, .env, .env.local)
npm run clean:local
```

Manual equivalent:

```bash
rm -rf node_modules dist
rm -rf data
rm -f .env .env.local
```

To remove the repository itself, delete the project folder after cleanup.

> Note: `rm` is permanent. Double-check your path before running commands.

## License

Licensed under the terms in `LICENSE`.

