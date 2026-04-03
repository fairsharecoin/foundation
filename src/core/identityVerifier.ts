import { createHash } from "node:crypto";

export type IdentityClaimInput = {
  passportNumber: string;
  birthDateIso: string;
  issuingAuthority: string;
  publicPepper: string;
};

export type IdentityVerificationResult = {
  coinMintId: string;
  verifier: "mock" | "nfc_icao";
  proofRef: string;
  verifiedAtIso: string;
};

export interface IdentityVerifier {
  verifyAndDerive(input: IdentityClaimInput): IdentityVerificationResult;
}

function deriveCoinMintId(input: IdentityClaimInput): string {
  const normalized = `${input.passportNumber.toUpperCase()}|${input.birthDateIso}|${input.issuingAuthority.toUpperCase()}|${input.publicPepper}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export class MockIdentityVerifier implements IdentityVerifier {
  verifyAndDerive(input: IdentityClaimInput): IdentityVerificationResult {
    const coinMintId = deriveCoinMintId(input);
    const proofRef = createHash("sha256").update(`mock-proof|${coinMintId}`).digest("hex").slice(0, 24);
    return {
      coinMintId,
      verifier: "mock",
      proofRef: `mock:${proofRef}`,
      verifiedAtIso: new Date().toISOString(),
    };
  }
}

export function createIdentityVerifier(): IdentityVerifier {
  const mode = String(process.env.FSC_IDENTITY_VERIFIER ?? "mock").toLowerCase();
  if (mode === "mock") return new MockIdentityVerifier();
  throw new Error(`Unsupported FSC_IDENTITY_VERIFIER mode: ${mode}`);
}
