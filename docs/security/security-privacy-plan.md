# Security & Privacy Hardening Plan v1

## Objective
Turn recent review outcomes into explicit, enforceable product and engineering policies for Phase 2 execution.

---

## 1) Identifier Exposure Policy (UUID + Email)

### Policy
- Treat wallet UUID and email as correlatable identifiers.
- Do not expose full UUID/email in public or shared UI surfaces by default.
- Reveal controls must be explicit, contextual, and limited to authenticated owner scope.

### Rules
- Public/demo screenshots/logs/docs must not include real correlatable identifier pairs.
- Demo accounts must be rotated/reset on schedule or after exposure.
- UI defaults:
  - Masked UUID (e.g., `c58c...8f41`)
  - Masked email (e.g., `d***@example.com`)

---

## 2) Email Policy Shift (Recovery-only display)

### Policy
- Email is recovery/auth lifecycle metadata, not primary identity display.

### Rules
- Display full email only in private Settings scope for the authenticated owner.
- Remove email from transfer, recipient discovery, and general profile surfaces.
- All copy should reflect: “Email is used for account recovery/security.”

---

## 3) Session Information Policy

### Policy
- Production UI should expose human-understandable session state only.

### Rules
- Allowed: “Session expires in ~12 minutes.”
- Not allowed in production UI: raw internal values (`sessionTtlSec`, token fields, internal IDs).
- Raw diagnostic session fields only under dev/debug mode with explicit toggle.

---

## 4) CSRF + Rate-Limit Matrix

### CSRF policy
- All mutating endpoints require same-origin + valid CSRF token.
- Fail closed (reject on missing/invalid token).

### Rate-limit dimensions
Use one or more dimensions by endpoint criticality:
- IP: network-level abuse control
- Account: authenticated abuse control
- Device/session fingerprint: repeated client abuse mitigation

### Baseline matrix (v1)
- Auth endpoints (`/login`, `/register`): IP + account
- Transfer endpoints: account + device (+ IP burst guard)
- Settings sensitive endpoints: account + device
- Read endpoints: lighter IP-based limits

### Cooldowns
- Preserve current transfer cooldown and recipient update cooldown.
- Add explicit cooldown policy docs per endpoint category.

---

## 5) Debug Panel Policy

### Policy
- Raw JSON response panels are development aids, not production UX.

### Rules
- Default OFF in production builds.
- Guard behind explicit debug toggle/environment flag.
- Must not display sensitive fields unless user is privileged and in non-prod context.

---

## 6) Canonical Recipient Rule

### Policy
- One canonical identifier for send path.

### Rules
- Transfer execution accepts one authoritative recipient identifier only.
- Other fields (nickname/email labels) are local convenience metadata and must not alter ledger destination semantics.
- Validation errors must be user-readable and explicit when canonical identifier is missing/invalid.

---

## 7) Logging, Audit, and Privacy

### Logging rules
- Log security-relevant events with timestamp + non-secret identifiers.
- Never log passwords, full secrets, or raw sensitive payloads.
- Minimize PII in logs; prefer hashed/truncated references.

---

## 8) Implementation Gate

This plan is considered integrated when:
1. Policies are reflected in code-level checks and UI behavior.
2. Automated tests cover rejection and acceptance paths.
3. Docs/runbooks are updated for operations and incident handling.
