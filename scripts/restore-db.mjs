#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let from = "";
let to = process.env.FSC_DB_PATH || path.resolve("data", "fsc.db");
let force = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if ((a === "--from" || a === "-f") && args[i + 1]) from = path.resolve(args[++i]);
  else if ((a === "--to" || a === "-t") && args[i + 1]) to = path.resolve(args[++i]);
  else if (a === "--force") force = true;
}

if (!from) {
  console.error("Usage: node scripts/restore-db.mjs --from <backup-file> [--to <db-path>] [--force]");
  process.exit(1);
}
if (!fs.existsSync(from)) {
  console.error(`Backup not found: ${from}`);
  process.exit(1);
}
if (fs.existsSync(to) && !force) {
  console.error(`Target DB exists: ${to}. Use --force to overwrite.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to, fs.constants.COPYFILE_FICLONE ?? 0);

const st = fs.statSync(to);
console.log(JSON.stringify({
  restoredAtIso: new Date().toISOString(),
  fromBackupPath: from,
  targetDbPath: to,
  sizeBytes: st.size,
}));
