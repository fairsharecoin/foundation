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
