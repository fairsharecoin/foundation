# Decentralization Migration Map (P2-005)

Last updated: 2026-04-03

## Purpose
Clarify which components are currently centralized and define phased replacement with decentralized equivalents.

## Current centralized components
1. **Auth/session management**: single deployment trust boundary
2. **Transfer execution path**: API server is authoritative execution point
3. **Persistence**: local SQLite operational store
4. **Operational controls**: deployment and monitoring tied to one operator environment

## Target decentralized end-state
1. **Protocol-level transfer settlement** as canonical source of truth
2. **Identity/uniqueness verification adapters** with verifiable evidence flow
3. **Multiple independently operated nodes** with transparent protocol behavior
4. **Open governance/process** for change management and compatibility

## Phased migration

### Phase A — Public alpha hardening (now)
- Keep centralized ops, but publish clear boundaries and risks
- Maintain strict security controls and observability
- Provide reproducible preflight and rollback routines

Acceptance criteria:
- Build/tests/preflight pass consistently
- Security runbooks and threat model are current

### Phase B — Interface stabilization
- Define stable domain interfaces for ledger/settlement adapter
- Ensure app logic is portable from local store authority to protocol authority

Acceptance criteria:
- Adapter seam documented and exercised in tests
- Canonical transfer identifiers preserved across boundaries

### Phase C — Decentralized settlement integration
- Move transfer finality from app-local authority to protocol mechanism
- Add reconciliation and failure-mode handling for partial network issues

Acceptance criteria:
- App treats protocol settlement as canonical
- End-to-end tests cover reorg/retry/consistency scenarios (or protocol-equivalent finality checks)

### Phase D — Multi-operator deployment model
- Document node operator requirements
- Publish compatibility/versioning matrix
- Add governance and release process for protocol/app changes

Acceptance criteria:
- At least two independent operator environments validated
- Versioned release and migration notes published per change

## Non-goals (current)
- Pretending full decentralization before settlement authority actually migrates
- Shipping tokenomics claims without implemented technical backing
