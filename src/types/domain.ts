export type WalletStatus = "active" | "frozen" | "dormant";

export type Wallet = {
  id: string;
  coinMintId: string;
  emailHash?: string;
  balancePico: bigint;
  status: WalletStatus;
  createdAt: Date;
  lastActiveAt: Date;
  birthdayMonthDay: string; // MM-DD
  lastRemintAt: Date;
};

export type LedgerEntry = {
  id: string;
  type: "ISSUE" | "TRANSFER" | "FREEZE" | "REACTIVATE" | "ANNUAL_BURN_REMINT";
  at: Date;
  fromWalletId?: string;
  toWalletId?: string;
  amountPico?: bigint;
  metadata?: Record<string, string>;
};

export const PICO_PER_FSC = 1_000_000_000_000n;
