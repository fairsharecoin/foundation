# Day 13 — Patch Critical/Major Issues + Targeted Regression Checks (v1)

Date: 2026-04-17
Owner: FSC foundation

## Goal
Close blocker/major findings from Day 12 with fast, controlled patches and high-signal regressions.

## Inputs
- `docs/ops/day12-triage-summary-YYYY-MM-DD.md`
- Canonical issue list from Day 12
- Current staging commit SHA

## Execution policy
- Prioritize by severity, then blast radius, then fix confidence
- Keep patches small and auditable (one concern per patch where possible)
- No broad refactors during Day 13

## Patch queue template

| Priority | Issue ID | Severity | Owner | Patch scope | Status |
|---|---|---|---|---|---|
| P0 |  | Blocker |  |  | todo |
| P1 |  | Major |  |  | todo |
| P2 |  | Major |  |  | todo |

## Regression pack (targeted)

Run at minimum:

```bash
npm run build
npm test
npm run preflight:staging
```

Then run focused manual checks for touched surfaces:

### Auth/session
- [ ] Login/logout
- [ ] Session ping and timeout behavior
- [ ] Password/email settings flow (if touched)

### Transfer path
- [ ] Happy path transfer A -> B
- [ ] Cooldown enforcement and recovery
- [ ] History reflects result correctly

### Error/guardrail behavior
- [ ] Validation errors remain user-safe and non-enumerating
- [ ] CSRF rejection behavior unchanged for mutating routes

## Exit criteria
- [ ] All blocker items resolved or mitigated with explicit temporary control
- [ ] All major items either patched or assigned with approved defer rationale
- [ ] Regression pack green
- [ ] Updated Day 14 inputs prepared

## Required outputs
- Patch log: `docs/ops/day13-patch-log-YYYY-MM-DD.md`
- Regression evidence: command outputs + notes linked in patch log
- Updated status entries in `docs/STATUS.md`, `TASKS.md`, and `WORKLOG.md`
