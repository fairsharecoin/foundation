#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [, , targetEnv, envFile] = process.argv;

if (!targetEnv || !envFile) {
  console.error("Usage: node scripts/preflight.mjs <staging|production> <env-file>");
  process.exit(1);
}

if (!["staging", "production"].includes(targetEnv)) {
  console.error(`Invalid target env: ${targetEnv}`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  const out = {};
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

const env = parseEnvFile(envFile);

if (env.NODE_ENV !== targetEnv) {
  fail(`NODE_ENV must be ${targetEnv} in ${envFile}`);
}
pass(`NODE_ENV=${env.NODE_ENV}`);

if (env.FSC_UI_DEBUG !== "0") {
  fail(`FSC_UI_DEBUG must be 0 in ${envFile}`);
}
pass("FSC_UI_DEBUG=0");

if (!env.FSC_DB_PATH) {
  fail(`FSC_DB_PATH must be set in ${envFile}`);
}
if (env.FSC_DB_PATH.endsWith("/data/fsc.db") || env.FSC_DB_PATH === "data/fsc.db") {
  fail("FSC_DB_PATH must not point to shared local default data/fsc.db");
}
pass(`FSC_DB_PATH set (${env.FSC_DB_PATH})`);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log("Running test suite...");
run("npm", ["test"]);

console.log("Running build...");
run("npm", ["run", "build"]);

console.log("Preflight OK");
