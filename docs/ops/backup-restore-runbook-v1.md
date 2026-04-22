# Backup/Restore Drill Runbook v1

Last updated: 2026-04-08

## Scope

Operational backup and restore procedure for the FSC foundation SQLite database.

## Defaults

- Default DB path: `data/fsc.db`
- Override DB path via env: `FSC_DB_PATH`
- Backup output dir default: `data/backups/`

## New scripts

- `npm run db:backup`
- `npm run db:restore -- --from <backup-file> [--to <target-db>] [--force]`

Notes:
- `db:backup` creates both a `.bak` file and a `.json` metadata file.
- `db:restore` is overwrite-protected unless `--force` is provided.

## Backup procedure

1. (Recommended) stop write traffic or briefly stop service.
2. Run:
   - `npm run db:backup`
3. Verify output:
   - backup file exists under `data/backups/`
   - matching `.json` metadata exists

Optional custom target:

```bash
node scripts/backup-db.mjs --db /path/to/fsc.db --out /path/to/backups --label pre-deploy
```

## Restore procedure

1. Stop service.
2. Restore to the target path:

```bash
npm run db:restore -- --from data/backups/fsc.db.<label>.<timestamp>.bak --to data/fsc.db --force
```

3. Start service.
4. Run smoke checks:
   - `GET /health`
   - login
   - transfer path

## Drill log (2026-04-08)

- Added backup/restore scripts and package commands.
- Verified backup artifact creation + metadata output.
- Verified restore path into a drill target DB file.
- Result: PASS (runbook/script layer)

## Operational cautions

- Keep backup files access-restricted (contain user/account state).
- Do not restore over active live DB without stopping service.
- Keep at least one known-good backup before deploy/migration operations.
