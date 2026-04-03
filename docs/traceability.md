# Traceability: Source Concept → Foundation Implementation

## One person, one coin
- Source: site + github pseudocode/technical
- Implemented: `Ledger.registerVerifiedHuman` blocks duplicate `coinMintId`

## Identity hash / COINMINT_ID
- Source: technical + architecture pages
- Implemented: `deriveCoinMintId` placeholder deterministic hash function
- Gap: real ICAO certificate + NFC verification

## Free transfers / fractions
- Source: technical page
- Implemented: `send` supports pico-unit precision (1e12)

## Annual burn/remint
- Source: home + why + technical
- Implemented: `applyAnnualBurnRemint(monthDay)` resets wallet to exactly `1 FSC`

## Dormancy model
- Source: technical + architecture
- Implemented: status enum + inactivity marker (`markDormantByInactivity`)

## Freeze/reactivation
- Source: github `TECHNICAL.md`
- Implemented: `freezeWallet` and `reactivateWallet`

## AI no-mint policy
- Source: AI & Autonomy page
- Implemented: implicitly by API design (no non-human issuance path)
- Gap: explicit policy module/rules engine
