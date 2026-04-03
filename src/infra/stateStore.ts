import Database from "better-sqlite3";
import { LedgerSnapshot } from "../core/ledger.js";

export type AppState = {
  ledger: LedgerSnapshot;
  walletByEmailHash: Record<string, string>;
  passwordHashByEmailHash: Record<string, string>;
  emailByWalletId: Record<string, string>;
  emailVerifiedByWalletId?: Record<string, boolean>;
  emailVerificationTokenByWalletId?: Record<string, string>;
  emailVerificationTokenExpiryByWalletId?: Record<string, number>;
};

export class StateStore {
  private db: Database.Database;

  constructor(dbPath = "./data/fsc.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("cache_size = -20000"); // ~20MB page cache
    this.db.pragma("mmap_size = 268435456"); // 256MB mmap
    this.initSchema();
    this.migrateAuthTableColumnsIfNeeded();
    this.migrateLegacyAppStateIfNeeded();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        coin_mint_id TEXT NOT NULL UNIQUE,
        email_hash TEXT,
        balance_pico TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        birthday_month_day TEXT NOT NULL,
        last_remint_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        at TEXT NOT NULL,
        from_wallet_id TEXT,
        to_wallet_id TEXT,
        amount_pico TEXT,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_accounts (
        email_hash TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        email_verification_token TEXT,
        email_verification_expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_at ON ledger_entries(at DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_from ON ledger_entries(from_wallet_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_to ON ledger_entries(to_wallet_id);
    `);
  }

  private migrateAuthTableColumnsIfNeeded(): void {
    const cols = this.db.prepare("PRAGMA table_info(auth_accounts)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));

    if (!names.has("email_verified")) {
      this.db.exec("ALTER TABLE auth_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    }
    if (!names.has("email_verification_token")) {
      this.db.exec("ALTER TABLE auth_accounts ADD COLUMN email_verification_token TEXT");
    }
    if (!names.has("email_verification_expires_at")) {
      this.db.exec("ALTER TABLE auth_accounts ADD COLUMN email_verification_expires_at INTEGER");
    }
  }

  private migrateLegacyAppStateIfNeeded(): void {
    const hasWallets = this.db.prepare("SELECT COUNT(*) as c FROM wallets").get() as { c: number };
    if (hasWallets.c > 0) return;

    const row = this.db.prepare("SELECT json FROM app_state WHERE id = 1").get() as { json: string } | undefined;
    if (!row) return;

    const legacy = JSON.parse(row.json) as AppState;
    this.save(legacy);
  }

  load(): AppState | null {
    const wallets = this.db.prepare(`
      SELECT id, coin_mint_id, email_hash, balance_pico, status, created_at, last_active_at, birthday_month_day, last_remint_at
      FROM wallets
    `).all() as Array<Record<string, string | null>>;

    const entries = this.db.prepare(`
      SELECT id, type, at, from_wallet_id, to_wallet_id, amount_pico, metadata_json
      FROM ledger_entries
      ORDER BY at ASC
    `).all() as Array<Record<string, string | null>>;

    const auth = this.db.prepare(`
      SELECT email_hash, wallet_id, password_hash, email, email_verified, email_verification_token, email_verification_expires_at
      FROM auth_accounts
    `).all() as Array<Record<string, string | number | null>>;

    if (wallets.length === 0 && entries.length === 0 && auth.length === 0) {
      return null;
    }

    const ledger: LedgerSnapshot = {
      wallets: wallets.map((w) => ({
        id: String(w.id),
        coinMintId: String(w.coin_mint_id),
        emailHash: w.email_hash ? String(w.email_hash) : undefined,
        balancePico: String(w.balance_pico),
        status: String(w.status) as "active" | "frozen" | "dormant",
        createdAt: String(w.created_at),
        lastActiveAt: String(w.last_active_at),
        birthdayMonthDay: String(w.birthday_month_day),
        lastRemintAt: String(w.last_remint_at),
      })),
      entries: entries.map((e) => ({
        id: String(e.id),
        type: String(e.type) as "ISSUE" | "TRANSFER" | "FREEZE" | "REACTIVATE" | "ANNUAL_BURN_REMINT",
        at: String(e.at),
        fromWalletId: e.from_wallet_id ? String(e.from_wallet_id) : undefined,
        toWalletId: e.to_wallet_id ? String(e.to_wallet_id) : undefined,
        amountPico: e.amount_pico ? String(e.amount_pico) : undefined,
        metadata: e.metadata_json ? JSON.parse(String(e.metadata_json)) as Record<string, string> : undefined,
      })),
    };

    const walletByEmailHash: Record<string, string> = {};
    const passwordHashByEmailHash: Record<string, string> = {};
    const emailByWalletId: Record<string, string> = {};
    const emailVerifiedByWalletId: Record<string, boolean> = {};
    const emailVerificationTokenByWalletId: Record<string, string> = {};
    const emailVerificationTokenExpiryByWalletId: Record<string, number> = {};

    for (const a of auth) {
      const emailHash = String(a.email_hash);
      const walletId = String(a.wallet_id);
      walletByEmailHash[emailHash] = walletId;
      passwordHashByEmailHash[emailHash] = String(a.password_hash);
      emailByWalletId[walletId] = String(a.email);
      emailVerifiedByWalletId[walletId] = Number(a.email_verified ?? 0) === 1;
      if (a.email_verification_token) {
        emailVerificationTokenByWalletId[walletId] = String(a.email_verification_token);
      }
      if (typeof a.email_verification_expires_at === "number") {
        emailVerificationTokenExpiryByWalletId[walletId] = a.email_verification_expires_at;
      }
    }

    return {
      ledger,
      walletByEmailHash,
      passwordHashByEmailHash,
      emailByWalletId,
      emailVerifiedByWalletId,
      emailVerificationTokenByWalletId,
      emailVerificationTokenExpiryByWalletId,
    };
  }

  save(state: AppState): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM wallets").run();
      this.db.prepare("DELETE FROM ledger_entries").run();
      this.db.prepare("DELETE FROM auth_accounts").run();

      const insertWallet = this.db.prepare(`
        INSERT INTO wallets (id, coin_mint_id, email_hash, balance_pico, status, created_at, last_active_at, birthday_month_day, last_remint_at)
        VALUES (@id, @coin_mint_id, @email_hash, @balance_pico, @status, @created_at, @last_active_at, @birthday_month_day, @last_remint_at)
      `);

      for (const w of state.ledger.wallets) {
        insertWallet.run({
          id: w.id,
          coin_mint_id: w.coinMintId,
          email_hash: w.emailHash ?? null,
          balance_pico: w.balancePico,
          status: w.status,
          created_at: w.createdAt,
          last_active_at: w.lastActiveAt,
          birthday_month_day: w.birthdayMonthDay,
          last_remint_at: w.lastRemintAt,
        });
      }

      const insertEntry = this.db.prepare(`
        INSERT INTO ledger_entries (id, type, at, from_wallet_id, to_wallet_id, amount_pico, metadata_json)
        VALUES (@id, @type, @at, @from_wallet_id, @to_wallet_id, @amount_pico, @metadata_json)
      `);

      for (const e of state.ledger.entries) {
        insertEntry.run({
          id: e.id,
          type: e.type,
          at: e.at,
          from_wallet_id: e.fromWalletId ?? null,
          to_wallet_id: e.toWalletId ?? null,
          amount_pico: e.amountPico ?? null,
          metadata_json: e.metadata ? JSON.stringify(e.metadata) : null,
        });
      }

      const insertAuth = this.db.prepare(`
        INSERT INTO auth_accounts (
          email_hash, wallet_id, password_hash, email, email_verified, email_verification_token, email_verification_expires_at
        )
        VALUES (
          @email_hash, @wallet_id, @password_hash, @email, @email_verified, @email_verification_token, @email_verification_expires_at
        )
      `);

      const emailVerifiedByWalletId = state.emailVerifiedByWalletId ?? {};
      const emailVerificationTokenByWalletId = state.emailVerificationTokenByWalletId ?? {};
      const emailVerificationTokenExpiryByWalletId = state.emailVerificationTokenExpiryByWalletId ?? {};

      for (const [emailHash, walletId] of Object.entries(state.walletByEmailHash)) {
        insertAuth.run({
          email_hash: emailHash,
          wallet_id: walletId,
          password_hash: state.passwordHashByEmailHash[emailHash] ?? "",
          email: state.emailByWalletId[walletId] ?? "",
          email_verified: emailVerifiedByWalletId[walletId] ? 1 : 0,
          email_verification_token: emailVerificationTokenByWalletId[walletId] ?? null,
          email_verification_expires_at: emailVerificationTokenExpiryByWalletId[walletId] ?? null,
        });
      }

      // keep legacy snapshot updated for backwards compatibility/debugging
      this.db.prepare(`
        INSERT INTO app_state (id, json, updated_at)
        VALUES (1, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at
      `).run(JSON.stringify(state));
    });

    tx();
  }

  close(): void {
    this.db.close();
  }
}
