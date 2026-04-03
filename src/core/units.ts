import { PICO_PER_FSC } from "../types/domain.js";

export function fscToPico(fsc: number): bigint {
  return BigInt(Math.round(fsc * 1e12));
}

export function picoToFsc(pico: bigint): string {
  const whole = pico / PICO_PER_FSC;
  const fractional = (pico % PICO_PER_FSC).toString().padStart(12, "0").replace(/0+$/, "");
  return fractional.length ? `${whole}.${fractional}` : `${whole}`;
}
