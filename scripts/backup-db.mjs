#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const args = process.argv.slice(2);
let dbPath = process.env.FSC_DB_PATH || path.resolve("data", "fsc.db");
let outDir = path.resolve("data", "backups");
let label = "manual";

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if ((a === "--db" || a === "-d") && args[i + 1]) dbPath = path.resolve(args[++i]);
  else if ((a === "--out" || a === "-o") && args[i + 1]) outDir = path.resolve(args[++i]);
  else if ((a === "--label" || a === "-l") && args[i + 1]) label = String(args[++i]).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(dbPath);
const outPath = path.join(outDir, `${base}.${label}.${ts()}.bak`);

fs.copyFileSync(dbPath, outPath, fs.constants.COPYFILE_FICLONE ?? 0);

const st = fs.statSync(outPath);
const metaPath = `${outPath}.json`;
const meta = {
  createdAtIso: new Date().toISOString(),
  sourceDbPath: dbPath,
  backupPath: outPath,
  sizeBytes: st.size,
  label,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

console.log(JSON.stringify(meta));
