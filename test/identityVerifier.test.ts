import test from "node:test";
import assert from "node:assert/strict";
import { MockIdentityVerifier } from "../src/core/identityVerifier.js";

test("mock identity verifier is deterministic for same identity input", () => {
  const v = new MockIdentityVerifier();
  const input = {
    passportNumber: "X123456",
    birthDateIso: "1990-01-01",
    issuingAuthority: "SE",
    publicPepper: "pepper-12345",
  };

  const a = v.verifyAndDerive(input);
  const b = v.verifyAndDerive(input);

  assert.equal(a.coinMintId, b.coinMintId);
  assert.equal(a.verifier, "mock");
  assert.match(a.proofRef, /^mock:/);
});

test("mock identity verifier changes coinMintId when identity basis changes", () => {
  const v = new MockIdentityVerifier();
  const one = v.verifyAndDerive({
    passportNumber: "X123456",
    birthDateIso: "1990-01-01",
    issuingAuthority: "SE",
    publicPepper: "pepper-12345",
  });
  const two = v.verifyAndDerive({
    passportNumber: "X999999",
    birthDateIso: "1990-01-01",
    issuingAuthority: "SE",
    publicPepper: "pepper-12345",
  });

  assert.notEqual(one.coinMintId, two.coinMintId);
});
