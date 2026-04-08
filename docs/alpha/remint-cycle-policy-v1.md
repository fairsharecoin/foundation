# FSC Remint Cycle Policy v1

Status: Approved for alpha direction (2026-04-08)

## Purpose

Define a clear, deterministic remint model for FairShareCoin (FSC) that supports continuous circulation, fairness, and anti-hoarding behavior.

---

## Core Policy (locked)

### 1) Individual wallet cycles

Each wallet operates on its own **100-day cycle**.

- Cycle anchor: `last_remint_at`
- Next remint moment: `next_remint_at = last_remint_at + 100 days`

Cycles are intentionally **desynchronized** across users.

### 2) Hard reset + remint on expiry

When a wallet reaches or passes `next_remint_at`:

- previous wallet balance is fully burned
- wallet balance is set to exactly **1.0 FSC**
- cycle anchor updates to current remint time

This is a strict reset policy.

### 3) No missed-remint accumulation

If a wallet is inactive for longer than one cycle, it does **not** receive multiple remints.

- On next qualifying check after expiry, apply **one** remint reset only.
- No backpay, no stacking, no multi-cycle mint catch-up.

### 4) Server-time determinism

Remint decisions are based on **trusted server time (UTC)** only.

- Client clocks are not authoritative.
- Policy evaluation must be deterministic and reproducible.

### 5) Required user visibility

The wallet UI must show, at minimum:

- current FSC balance
- days/time remaining until next remint
- exact next remint date/time

This transparency is required because FSC behavior is time-sensitive by design.

---

## Product interpretation

FSC is designed primarily as a **flow currency**, not long-term storage.

- Nominal amount alone is not the full user context.
- Remaining time in cycle is part of practical wallet state.

---

## Reference implementation behavior (alpha)

### Trigger strategy

Use lazy enforcement on wallet-touch events (for correctness), such as:

- login/session wallet load
- transfer initiation path
- balance/history fetch paths

Optional: background sweeper can be added for operational hygiene/analytics, but correctness must not depend on it.

### Pseudocode

```text
if now_utc >= next_remint_at:
  pre_balance = balance
  balance = 1.0
  last_remint_at = now_utc
  next_remint_at = now_utc + 100 days
  append_ledger_event(type=REMINT_RESET, pre_balance, post_balance=1.0)
```

### Auditability

Each remint reset should be recorded as a ledger/audit event with:

- event type: `REMINT_RESET`
- wallet identifier
- `pre_balance`
- `post_balance` (must be `1.0`)
- remint timestamp
- policy version (`v1`)

---

## Non-goals for alpha

- No counterparty cycle-time sharing in transaction UX
- No dynamic pricing modifiers based on cycle position
- No multi-tier remint logic

Alpha goal is simple, clear, and predictable behavior.

---

## Change control

Any future change to:

- cycle length,
- reset amount,
- accumulation semantics,
- or timing authority

must be versioned in a new policy document (e.g., `remint-cycle-policy-v2.md`) with migration notes.
