import { createHash } from "node:crypto";

/**
 * Placeholder for COINMINT_ID derivation.
 * In real FSC, ICAO NFC ePassport verification + stable field extraction + peppering is required.
 */
export function deriveCoinMintId(input: {
  passportNumber: string;
  birthDateIso: string;
  issuingAuthority: string;
  publicPepper: string;
}): string {
  const normalized = `${input.passportNumber.toUpperCase()}|${input.birthDateIso}|${input.issuingAuthority.toUpperCase()}|${input.publicPepper}`;
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
