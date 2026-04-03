# Alias Layer vs Internal UUID — Recommendation (Phase 2 prep)

Date: 2026-03-03

## Decision
Use a **two-layer identity model**:

1. **Internal canonical identifier:** wallet UUID (unchanged)
2. **External UX identifier:** alias handle layer (human-friendly, revocable, non-canonical)

Transfers stay UUID-canonical in ledger and API core.

## Why
- Preserves safety and immutability for accounting/audit (`transferId`, wallet UUID)
- Improves UX by avoiding raw UUID exposure in normal flows
- Allows future alias policy changes without breaking ledger invariants

## Scope boundaries
- Alias is not ownership proof by itself
- Alias does not replace wallet UUID in transfer settlement
- Alias is a resolver input, not a ledger address

## Proposed Phase 2 implementation order

### Step 1 (low risk)
- Keep current transfer API UUID-based
- Add explicit UI wording: alias/nickname are convenience labels only
- Add API contract note: canonical fields are `transferId`, `fromWalletId`, `toWalletId`

### Step 2 (resolver)
- Add alias registry table with:
  - `alias` (unique, normalized)
  - `walletId`
  - `status` (`active|reserved|revoked`)
  - timestamps + audit fields
- Add read endpoint:
  - `GET /resolve-alias/:alias -> { walletId, status }` (auth + rate-limited)

### Step 3 (safe transfer UX)
- UI accepts alias input
- UI resolves alias -> UUID before submit
- Transfer still posts UUID to `/transfer`
- Confirmation modal displays both alias + masked UUID

### Step 4 (abuse/security controls)
- Alias claim/update cooldown
- Reserved words + homoglyph checks
- Abuse throttles + audit events (`alias_claim`, `alias_revoke`, `alias_resolve`)

## Minimal acceptance criteria
- No transfer path where alias bypasses UUID resolution
- Ledger remains UUID/transferId canonical only
- Full auditability from transfer to canonical wallet IDs
- UX allows normal users to avoid raw UUID typing
