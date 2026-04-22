# Day 9 — External Staging Validation Check (2026-04-17)

Scope: re-check external staging DNS/HTTP/HTTPS path for `staging.fairsharecoin.org`.

## Commands run

```bash
dig +short staging.fairsharecoin.org
curl -I --max-time 12 http://staging.fairsharecoin.org
curl -I --max-time 12 https://staging.fairsharecoin.org
curl -sS --max-time 12 https://staging.fairsharecoin.org/health
```

## Results

- DNS: resolves to `194.9.94.85` and `194.9.94.86`
- HTTP (80): responds `200 OK` from generic `nginx` + `PHP/8.2.30` page
- HTTPS (443): connection timeout (12s max-time)
- `/health` over HTTPS: timeout (12s max-time)

## Assessment

External staging validation remains blocked. FSC staging app is still not reachable over TLS on the staging domain.

## Required fix before Day 12

1. Configure reverse proxy vhost for `staging.fairsharecoin.org`.
2. Point upstream to FSC staging app port (`4011`, or chosen staging port).
3. Install/verify TLS certificate for staging host.
4. Set HTTP 80 to redirect to HTTPS.
5. Re-run this check + external smoke flow.

## Related references

- `docs/ops/weekend-staging-guided-checklist-v1.md`
- `docs/plans/day12-private-testing-window-and-triage-v1.md`
