import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

import { Ledger } from "../src/core/ledger.js";
import { StateStore, type AppState } from "../src/infra/stateStore.js";

function makeState(): AppState {
  const ledger = new Ledger();
  const now = new Date("2026-02-24T00:00:00.000Z");
  const w = ledger.registerVerifiedHuman({ coinMintId: "persist-a", email: "a@example.com", now });

  return {
    ledger: ledger.snapshot(),
    walletByEmailHash: { "email-hash-a": w.id },
    passwordHashByEmailHash: { "email-hash-a": "bcrypt-hash-a" },
    emailByWalletId: { [w.id]: "a@example.com" },
  };
}

test("state store save/load roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "fsc-store-"));
  const dbPath = join(dir, "fsc.db");

  try {
    const store = new StateStore(dbPath);
    const state = makeState();
    store.save(state);
    const loaded = store.load();

    assert.ok(loaded);
    assert.equal(loaded?.ledger.wallets.length, 1);
    assert.equal(loaded?.walletByEmailHash["email-hash-a"], state.walletByEmailHash["email-hash-a"]);
    assert.equal(loaded?.emailByWalletId[state.ledger.wallets[0].id], "a@example.com");

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy app_state migrates into normalized tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "fsc-migrate-"));
  const dbPath = join(dir, "fsc.db");

  try {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const legacy = makeState();
    db.prepare(`
      INSERT INTO app_state (id, json, updated_at)
      VALUES (1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at
    `).run(JSON.stringify(legacy));
    db.close();

    const store = new StateStore(dbPath);
    const loaded = store.load();

    assert.ok(loaded);
    assert.equal(loaded?.ledger.wallets.length, 1);
    assert.equal(Object.keys(loaded?.walletByEmailHash ?? {}).length, 1);

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
