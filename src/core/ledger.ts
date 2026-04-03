import { randomUUID } from "node:crypto";
import { hashEmail } from "./identity.js";
import { LedgerEntry, PICO_PER_FSC, Wallet } from "../types/domain.js";

export class FSCError extends Error {}

export class Ledger {
  private walletsById = new Map<string, Wallet>();
  private walletByCoinMint = new Map<string, string>();
  private entries: LedgerEntry[] = [];

  static fromSnapshot(snapshot: LedgerSnapshot): Ledger {
    const l = new Ledger();
    l.walletsById = new Map(snapshot.wallets.map((w) => [w.id, {
      ...w,
      balancePico: BigInt(w.balancePico),
      createdAt: new Date(w.createdAt),
      lastActiveAt: new Date(w.lastActiveAt),
      lastRemintAt: new Date(w.lastRemintAt),
    }]));
    l.walletByCoinMint = new Map(snapshot.wallets.map((w) => [w.coinMintId, w.id]));
    l.entries = snapshot.entries.map((e) => ({
      ...e,
      at: new Date(e.at),
      amountPico: e.amountPico ? BigInt(e.amountPico) : undefined,
    }));
    return l;
  }

  snapshot(): LedgerSnapshot {
    return {
      wallets: [...this.walletsById.values()].map((w) => ({
        ...w,
        balancePico: w.balancePico.toString(),
        createdAt: w.createdAt.toISOString(),
        lastActiveAt: w.lastActiveAt.toISOString(),
        lastRemintAt: w.lastRemintAt.toISOString(),
      })),
      entries: this.entries.map((e) => ({
        ...e,
        at: e.at.toISOString(),
        amountPico: e.amountPico?.toString(),
      })),
    };
  }

  registerVerifiedHuman(input: {
    coinMintId: string;
    email?: string;
    now?: Date;
  }): Wallet {
    if (this.walletByCoinMint.has(input.coinMintId)) {
      throw new FSCError("coin already issued for this identity");
    }

    const now = input.now ?? new Date();
    const wallet: Wallet = {
      id: randomUUID(),
      coinMintId: input.coinMintId,
      emailHash: input.email ? hashEmail(input.email) : undefined,
      balancePico: PICO_PER_FSC,
      status: "active",
      createdAt: now,
      lastActiveAt: now,
      birthdayMonthDay: now.toISOString().slice(5, 10),
      lastRemintAt: now,
    };

    this.walletsById.set(wallet.id, wallet);
    this.walletByCoinMint.set(wallet.coinMintId, wallet.id);
    this.entries.push({ id: randomUUID(), type: "ISSUE", at: now, toWalletId: wallet.id, amountPico: PICO_PER_FSC });
    return wallet;
  }

  send(fromWalletId: string, toWalletId: string, amountPico: bigint, now = new Date(), message?: string): string {
    const from = this.requireWallet(fromWalletId);
    const to = this.requireWallet(toWalletId);

    if (amountPico <= 0n) throw new FSCError("amount must be > 0");
    if (from.status !== "active" || to.status !== "active") throw new FSCError("both wallets must be active");
    if (from.balancePico < amountPico) throw new FSCError("insufficient funds");

    from.balancePico -= amountPico;
    to.balancePico += amountPico;
    from.lastActiveAt = now;
    to.lastActiveAt = now;

    const entryId = randomUUID();
    this.entries.push({
      id: entryId,
      type: "TRANSFER",
      at: now,
      fromWalletId,
      toWalletId,
      amountPico,
      metadata: message ? { message } : undefined,
    });
    return entryId;
  }

  freezeWallet(walletId: string, reason: string, now = new Date()): void {
    const wallet = this.requireWallet(walletId);
    wallet.status = "frozen";
    this.entries.push({ id: randomUUID(), type: "FREEZE", at: now, toWalletId: walletId, metadata: { reason } });
  }

  reactivateWallet(walletId: string, now = new Date()): void {
    const wallet = this.requireWallet(walletId);
    wallet.status = "active";
    wallet.lastActiveAt = now;
    this.entries.push({ id: randomUUID(), type: "REACTIVATE", at: now, toWalletId: walletId });
  }

  applyAnnualBurnRemint(monthDay: string, now = new Date()): number {
    let count = 0;
    for (const wallet of this.walletsById.values()) {
      if (wallet.birthdayMonthDay !== monthDay) continue;
      wallet.balancePico = PICO_PER_FSC;
      wallet.lastRemintAt = now;
      this.entries.push({
        id: randomUUID(),
        type: "ANNUAL_BURN_REMINT",
        at: now,
        toWalletId: wallet.id,
        metadata: { monthDay },
      });
      count += 1;
    }
    return count;
  }

  applySimulationRemintIfDue(intervalMs: number, now = new Date()): number {
    let count = 0;
    for (const wallet of this.walletsById.values()) {
      if (now.getTime() - wallet.lastRemintAt.getTime() < intervalMs) continue;
      wallet.balancePico = PICO_PER_FSC;
      wallet.lastRemintAt = now;
      this.entries.push({
        id: randomUUID(),
        type: "ANNUAL_BURN_REMINT",
        at: now,
        toWalletId: wallet.id,
        metadata: { mode: "simulation-12h" },
      });
      count += 1;
    }
    return count;
  }

  markDormantByInactivity(cutoff: Date): number {
    let count = 0;
    for (const w of this.walletsById.values()) {
      if (w.status === "active" && w.lastActiveAt < cutoff) {
        w.status = "dormant";
        count += 1;
      }
    }
    return count;
  }

  getWallet(walletId: string): Wallet | undefined {
    return this.walletsById.get(walletId);
  }

  getWalletByCoinMint(coinMintId: string): Wallet | undefined {
    const id = this.walletByCoinMint.get(coinMintId);
    return id ? this.walletsById.get(id) : undefined;
  }

  listWallets(): Wallet[] {
    return [...this.walletsById.values()];
  }

  listEntries(): LedgerEntry[] {
    return this.entries;
  }

  private requireWallet(walletId: string): Wallet {
    const wallet = this.walletsById.get(walletId);
    if (!wallet) throw new FSCError("wallet not found");
    return wallet;
  }
}

type WalletSnapshot = Omit<Wallet, "balancePico" | "createdAt" | "lastActiveAt" | "lastRemintAt"> & {
  balancePico: string;
  createdAt: string;
  lastActiveAt: string;
  lastRemintAt: string;
};

type EntrySnapshot = Omit<LedgerEntry, "at" | "amountPico"> & {
  at: string;
  amountPico?: string;
};

export type LedgerSnapshot = {
  wallets: WalletSnapshot[];
  entries: EntrySnapshot[];
};
