# Architecture Note v1 — Gateway + Node Model

## Purpose
Define a decentralization-aligned architecture direction where `fairsharecoin.org` acts as an access gateway, not the single source of truth.

---

## 1) Gateway Role (`fairsharecoin.org`)

### Position
- `fairsharecoin.org` is the default user-facing gateway for web/app access.
- It is an ingress/discovery layer, not the authoritative ledger by itself.

### Responsibilities
- Serve UI/API entrypoint
- Route requests to node-backed services
- Provide resilience features (health checks, fallback routing)

### Non-responsibilities
- Must not be treated as sole owner of canonical transaction truth.

---

## 2) Node Model (P920 first)

### Initial state
- ThinkStation P920 operates as first full node in the network model.

### Growth path
- Add independent nodes over time (geo/network separation preferred).
- Define trust and quorum assumptions for multi-node operation.
- Ensure failure of one node (or gateway) does not imply data-loss of chain state.

---

## 3) On-chain vs Off-chain Boundary

### On-chain (authoritative)
- Transfer records and ordering
- Issuance/remint-critical lifecycle events
- Integrity-critical state transitions

### Off-chain (convenience/local cache)
- Recipient nicknames
- Local labels/metadata
- UX-only derived views and indexing accelerators

### Rule
- Off-chain metadata must never redefine on-chain destination semantics.

---

## 4) Public Address/Alias Layer over Internal UUIDs

### Problem
- Internal UUIDs are functional but poor UX and potentially correlatable if overexposed.

### Direction
- Introduce a public alias/address layer for human-facing transfer inputs.
- Keep internal UUIDs implementation-level and minimally exposed.

### Requirements
- Alias resolution must be deterministic and auditable.
- Collisions and reassignment rules must be explicit.
- Migration path from UUID-only flow must preserve transfer correctness.

---

## 5) Security and Privacy Alignment

- Mask internal identifiers by default in UI.
- Keep email recovery-only in private settings scope.
- Avoid exposing raw internals in production-facing debug output.
- Enforce single canonical send identifier semantics.

---

## 6) Phased Adoption

### Phase A (now)
- Document boundaries and policies.
- Keep UUID-only transfer path while reducing exposure.

### Phase B
- Introduce alias/address resolution layer.
- Add monitoring and abuse controls around resolution endpoints.

### Phase C
- Multi-node expansion with stronger decentralization guarantees.
- Publish open architecture and contribution roadmap.
