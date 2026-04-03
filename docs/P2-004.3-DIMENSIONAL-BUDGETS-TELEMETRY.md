# P2-004.3 Endpoint-Specific Dimensional Budgets + Telemetry Labels

Status: complete (2026-03-12)
Owner: Security/Backend

## Goal
Move from uniform endpoint rate limits to explicit per-endpoint/per-dimension budgets and add machine-readable telemetry for limit hits.

## Implemented changes

### 1) Per-dimension budget model
Added typed budget model in API server:
- `RateDimensionBudget`
- `RateDimensionBudgets`
- `DEFAULT_DIMENSION_BUDGETS`

`checkActionLimitByDimensions(...)` now supports endpoint-specific `budgets`:
- `ip`: `{ maxHits, windowMs }`
- `account`: `{ maxHits, windowMs }`
- `device`: `{ maxHits, windowMs }`

### 2) Endpoint-specific budget map
Added `ENDPOINT_BUDGETS` for high-value paths:
- `register`
- `login`
- `transfer`
- `ping`
- `walletRead`
- `ledgerRead`
- `recipientLookup`

This allows tighter account/device controls while leaving room for shared IP scenarios.

### 3) Rate-limit telemetry labels
`checkActionLimit(...)` now emits structured audit event on block:
- event: `rate_limit_hit`
- fields: `scope`, `dimension`, `maxHits`, `windowMs`, `waitSec`, `accountHint`

`accountHint` is truncated (`slice(0, 12)`) to reduce sensitive identifier exposure.

## Validation

```bash
npm test
npm run build
```

Result: passing (19/19 tests + successful build).

## Files touched
- `src/api/server.ts`
