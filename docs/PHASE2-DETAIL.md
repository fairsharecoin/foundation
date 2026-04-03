# Phase 2 Detailed Plan (P2-002 → P2-005)

## Prioritization Principle
Security/privacy-impact work is front-loaded.

Order of execution:
1. P2-004 Security + monitoring uplift (highest risk reduction)
2. P2-003 Account trust + lifecycle enhancements
3. P2-002 Controlled public alpha environment
4. P2-005 Open-source/decentralization prep

---

## P2-004 — Security + Monitoring Uplift

### P2-004.1 Threat model pass (auth, transfer, settings)
- Dependencies: none
- Tasks:
  - Map assets, trust boundaries, and abuse cases
  - Define attacker profiles (anon, authenticated, automated)
  - Rank risks by likelihood × impact
- Done when:
  - Threat model doc exists with mitigations and owners

### P2-004.2 CSRF hardening verification matrix
- Dependencies: P2-004.1
- Tasks:
  - Validate all mutating endpoints require valid CSRF
  - Add automated tests for reject/accept paths
  - Add cross-origin negative tests
- Done when:
  - Matrix complete and tests green in CI/local

### P2-004.3 Rate-limit dimensions expansion (IP + account + device)
- Dependencies: P2-004.1
- Tasks:
  - Define per-endpoint budget and burst windows
  - Implement key strategy by endpoint sensitivity
  - Add lockout/backoff telemetry events
- Done when:
  - Limits active on auth/settings/transfer-critical endpoints

### P2-004.4 Monitoring and alerting baseline
- Dependencies: P2-004.1
- Tasks:
  - Define security events and thresholds
  - Wire alerts for brute force, suspicious transfer bursts, CSRF failures
  - Add runbook for triage steps
- Done when:
  - Alert paths tested end-to-end with synthetic events

### P2-004.5 Security regression pack
- Dependencies: P2-004.2, P2-004.3
- Tasks:
  - Add regression tests for known attack paths
  - Add abuse-simulation tests for rate limits/cooldowns
- Done when:
  - Security pack passes consistently and blocks regressions

---

## P2-003 — Account Trust + Lifecycle Enhancements

### P2-003.1 Email policy shift to recovery-only
- Dependencies: P2-004.1
- Tasks:
  - Remove email as public-facing identity element
  - Keep email display only in private settings scope
  - Update copy and UX labels accordingly
- Done when:
  - No non-settings view exposes full email

### P2-003.2 Session info policy refinement
- Dependencies: P2-004.1
- Tasks:
  - UI shows only human countdown (e.g., “12m left”)
  - Remove raw internal fields from production UI
- Done when:
  - No raw session internals visible outside debug/dev mode

### P2-003.3 Settings hardening (change email/password)
- Dependencies: P2-003.1
- Tasks:
  - Add step-up verification for sensitive changes
  - Add confirmation workflows + audit entries
  - Apply dedicated cooldowns and rate limits
- Done when:
  - Sensitive setting changes are verified, logged, and throttled

### P2-003.4 Account recovery flows
- Dependencies: P2-003.1, P2-003.3
- Tasks:
  - Define recovery token lifecycle and expiry
  - Add anti-abuse controls and attempt tracking
- Done when:
  - Recovery path is tested for happy + abuse scenarios

---

## P2-002 — Controlled Public Alpha Environment

### P2-002.1 Environment split (local/staging/prod)
- Dependencies: P2-004.1
- Tasks:
  - Define config boundaries and secrets handling
  - Ensure prod-safe defaults for cookies/security headers
- Done when:
  - Distinct deployable environments exist with documented config

### P2-002.2 Deployment pipeline + rollback
- Dependencies: P2-002.1
- Tasks:
  - Build repeatable deployment steps
  - Add rollback procedure + preflight checks
- Done when:
  - Staging deployment/rollback tested at least once

### P2-002.3 Demo data and identifier hygiene
- Dependencies: P2-003.1
- Tasks:
  - Rotate/reset demo accounts regularly
  - Prevent publication of correlatable UUID/email pairs
- Done when:
  - Demo rotation SOP exists and is practiced

### P2-002.4 Public alpha guardrails
- Dependencies: P2-002.2, P2-004.4
- Tasks:
  - Introduce feature flags for risky surfaces
  - Define operational SLOs and incident response entry points
- Done when:
  - Alpha checklist can be run and signed before exposure

---

## P2-005 — Open-Source + Decentralization Prep

### P2-005.1 Architecture transparency package
- Dependencies: P2-004.1
- Tasks:
  - Publish chain-of-truth model (on-chain vs off-chain)
  - Document canonical transfer identifier policy
- Done when:
  - Public architecture docs are coherent and reviewable

### P2-005.2 Public alias/address layer design
- Dependencies: P2-005.1
- Tasks:
  - Design human-friendly address/alias namespace
  - Keep internal UUIDs non-public where possible
- Done when:
  - Addressing scheme chosen with migration constraints documented

### P2-005.3 Repo quality and contribution docs
- Dependencies: P2-005.1
- Tasks:
  - Add contribution guide, issue templates, security policy
  - Add dev setup and test expectations
- Done when:
  - External contributor can run and validate project locally

### P2-005.4 Node growth roadmap
- Dependencies: P2-005.1
- Tasks:
  - Define P920 initial node role
  - Document multi-node growth phases and failure domains
- Done when:
  - Roadmap exists with phase gates and operational assumptions

---

## Dependency Summary
- Security model first (P2-004.1) unlocks most downstream decisions.
- P2-003 and P2-002 should consume P2-004 outputs to avoid rework.
- P2-005 should publish stabilized architecture and addressing decisions after core policies are fixed.
