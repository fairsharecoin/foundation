import test from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/core/ledger.js";
import { deriveCoinMintId } from "../src/core/identity.js";
import { PICO_PER_FSC } from "../src/types/domain.js";

test("one person can only be issued once", () => {
  const ledger = new Ledger();
  const id = deriveCoinMintId({
    passportNumber: "X12345",
    birthDateIso: "1990-01-01",
    issuingAuthority: "SE",
    publicPepper: "fairsharecoin-demo-pepper",
  });

  ledger.registerVerifiedHuman({ coinMintId: id });
  assert.throws(() => ledger.registerVerifiedHuman({ coinMintId: id }));
});

test("annual burn/remint resets birthday wallet to 1 FSC", () => {
  const ledger = new Ledger();
  const now = new Date("2026-02-24T00:00:00.000Z");
  const a = ledger.registerVerifiedHuman({ coinMintId: "a", now });
  const b = ledger.registerVerifiedHuman({ coinMintId: "b", now });

  ledger.send(a.id, b.id, 100n);
  assert.equal(ledger.getWallet(a.id)?.balancePico, PICO_PER_FSC - 100n);

  const updated = ledger.applyAnnualBurnRemint("02-24", now);
  assert.equal(updated, 2);
  assert.equal(ledger.getWallet(a.id)?.balancePico, PICO_PER_FSC);
});

test("simulation remint triggers only when interval is due", () => {
  const ledger = new Ledger();
  const t0 = new Date("2026-02-24T00:00:00.000Z");
  const a = ledger.registerVerifiedHuman({ coinMintId: "sim-a", now: t0 });
  const b = ledger.registerVerifiedHuman({ coinMintId: "sim-b", now: t0 });

  ledger.send(a.id, b.id, 500n, new Date("2026-02-24T00:01:00.000Z"));
  assert.equal(ledger.getWallet(a.id)?.balancePico, PICO_PER_FSC - 500n);

  const tooEarly = ledger.applySimulationRemintIfDue(12 * 60 * 60 * 1000, new Date("2026-02-24T11:59:59.000Z"));
  assert.equal(tooEarly, 0);

  const due = ledger.applySimulationRemintIfDue(12 * 60 * 60 * 1000, new Date("2026-02-24T12:00:01.000Z"));
  assert.equal(due, 2);
  assert.equal(ledger.getWallet(a.id)?.balancePico, PICO_PER_FSC);
});

test("frozen wallet cannot send until reactivated", () => {
  const ledger = new Ledger();
  const now = new Date("2026-02-24T00:00:00.000Z");
  const a = ledger.registerVerifiedHuman({ coinMintId: "freeze-a", now });
  const b = ledger.registerVerifiedHuman({ coinMintId: "freeze-b", now });

  ledger.freezeWallet(a.id, "test-freeze");
  assert.throws(() => ledger.send(a.id, b.id, 1n));

  ledger.reactivateWallet(a.id);
  ledger.send(a.id, b.id, 1n);
  assert.equal(ledger.getWallet(a.id)?.balancePico, PICO_PER_FSC - 1n);
});

test("ledger snapshot roundtrip preserves balances and entries", () => {
  const original = new Ledger();
  const now = new Date("2026-02-24T00:00:00.000Z");
  const a = original.registerVerifiedHuman({ coinMintId: "snap-a", now });
  const b = original.registerVerifiedHuman({ coinMintId: "snap-b", now });
  original.send(a.id, b.id, 321n);

  const restored = Ledger.fromSnapshot(original.snapshot());
  assert.equal(restored.getWallet(a.id)?.balancePico, PICO_PER_FSC - 321n);
  assert.equal(restored.listEntries().length, original.listEntries().length);
});
