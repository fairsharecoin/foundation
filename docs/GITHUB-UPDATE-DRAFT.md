# GitHub Update Draft (Ready to Paste)

## Changelog Snapshot

### ✅ Phase 1 completed (P1-001 → P1-011)
- Stability sweep + bug fixes closed
- CSRF protection enforced on mutating routes
- Session/cookie hardening pass complete
- Server-side validation consistency tightened
- Core + negative/regression test coverage expanded
- Audit logging baseline active
- Docs/runbook refreshed
- Phase 1 exit gate signed off

### ✅ Phase 2 started: P2-001 complete
- Identity verifier adapter seam finalized
- Register flow now wired through verifier abstraction
- Verification metadata surfaced through the seam
- Tests added for verifier + API behavior

### UX / error handling improvements
- Full history rendering issue fixed (`esc` reference)
- User-facing behavior remains lightweight while safety checks tightened

---

## Suggested Commit Plan (logical chunks)

1. **security(csrf): enforce token + same-origin on mutating routes**
2. **security(session): harden cookie policy + idle timeout behavior**
3. **test(api): add security + negative coverage (csrf/cooldown/forbidden paths)**
4. **fix(ui): repair full history rendering escape-path regression**
5. **feat(identity): add verifier adapter seam and registration integration**
6. **docs: refresh README/runbook and phase ticket board progress**

---

## PR Draft Text

### Title
Phase 1 hardening complete + P2-001 identity verifier seam

### Summary
This PR closes the Phase 1 hardening package and lands the first concrete Phase 2 item (P2-001). It strengthens core security controls (CSRF/session), expands regression and negative-path testing, fixes a known history rendering bug, and introduces a clean identity verifier adapter seam for future NFC/ePassport + ICAO integration.

### What changed
- Enforced CSRF validation strategy for mutating endpoints
- Hardened session cookie handling and production security flags
- Added API tests for security reject/accept paths and abuse controls
- Fixed full history UI regression (`esc` path)
- Added identity verifier adapter and integrated registration flow
- Updated docs and project board progress

### Risk notes
- Security behavior is stricter; clients without valid CSRF flow will now fail as intended.
- Session policy enforcement is tighter; edge-case session handling should be watched during rollout.
- Identity verifier abstraction is currently mock-backed; production verifier still pending future integration.

### Test status
- `npm test`: passing
- `npm run build`: passing

### Follow-ups (next)
- Expand P2-002→P2-005 detailed execution tickets
- Apply privacy policy shifts (identifier exposure + email recovery-only)
- Add monitoring/alerting baseline for alpha readiness
