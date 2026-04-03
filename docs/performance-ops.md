# Performance & Ops (Debian 12)

Safe optimizations applied:
- SQLite pragmas: WAL, synchronous=NORMAL, temp_store=MEMORY, cache_size, mmap_size
- Production start scripts added in `package.json`
- `/ledger` now supports pagination/filter (`limit`, `offset`, `type`)

## Run in production mode

```bash
cd /home/idk/.openclaw/workspace/fairsharecoin-foundation
npm run build
npm run start:prod
```

## Optional: PM2 (recommended)

```bash
npm i -g pm2
cd /home/idk/.openclaw/workspace/fairsharecoin-foundation
pm2 start dist/api/server.js --name fsc --time --update-env
pm2 save
pm2 status
```

## Optional: Nginx reverse proxy (later public alpha)
- Keep Node app on localhost (e.g. :4010)
- Terminate TLS and cache static responses via nginx

## API usage best practice
- Avoid unbounded reads:
  - `GET /ledger?limit=100&offset=0`
  - `GET /ledger?type=TRANSFER&limit=100&offset=0`

## Monitoring quick commands

```bash
htop
iostat -xz 1
pm2 monit
```

## Notes
- GPU is not a bottleneck for this Node + SQLite app.
- CPU/RAM + disk I/O tuning matter more.
