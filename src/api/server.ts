import express from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { hashEmail } from "../core/identity.js";
import { createIdentityVerifier } from "../core/identityVerifier.js";
import { Ledger, FSCError } from "../core/ledger.js";
import { fscToPico, picoToFsc } from "../core/units.js";
import { StateStore } from "../infra/stateStore.js";

const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT ?? 4010);

const SIM_REMINT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h simulation cycle
const SIM_REMINT_CHECK_MS = 60 * 1000; // check every minute
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 min idle timeout
const CSRF_COOKIE_NAME = "fsc_csrf";
const SESSION_COOKIE_NAME = "fsc_session";
const DEVICE_COOKIE_NAME = "fsc_device";
const DEBUG_UI_ENABLED = process.env.FSC_UI_DEBUG === "1";
const parsedEmailTtlSec = Number(process.env.FSC_EMAIL_VERIFICATION_TTL_SEC ?? 5 * 60);
const EMAIL_VERIFICATION_TTL_SEC = Number.isFinite(parsedEmailTtlSec)
  ? Math.min(24 * 60 * 60, Math.max(60, Math.floor(parsedEmailTtlSec)))
  : 5 * 60;

function resolveDbPath(): string {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const configured = process.env.FSC_DB_PATH?.trim();

  if ((nodeEnv === "staging" || nodeEnv === "production") && !configured) {
    throw new Error("FSC_DB_PATH is required when NODE_ENV is staging or production");
  }

  const fallback = path.resolve(process.cwd(), "data", "fsc.db");
  return configured ? path.resolve(configured) : fallback;
}

const dbPath = resolveDbPath();
mkdirSync(path.dirname(dbPath), { recursive: true });
const store = new StateStore(dbPath);
const loaded = store.load();

const ledger = loaded ? Ledger.fromSnapshot(loaded.ledger) : new Ledger();
const walletByEmailHash = new Map<string, string>(Object.entries(loaded?.walletByEmailHash ?? {}));
const passwordHashByEmailHash = new Map<string, string>(Object.entries(loaded?.passwordHashByEmailHash ?? {}));
const emailByWalletId = new Map<string, string>(Object.entries(loaded?.emailByWalletId ?? {}));
const emailVerifiedByWalletId = new Map<string, boolean>(Object.entries(loaded?.emailVerifiedByWalletId ?? {}).map(([k, v]) => [k, Boolean(v)]));
const emailVerificationTokenByWalletId = new Map<string, string>(Object.entries(loaded?.emailVerificationTokenByWalletId ?? {}));
const emailVerificationTokenExpiryByWalletId = new Map<string, number>(Object.entries(loaded?.emailVerificationTokenExpiryByWalletId ?? {}).map(([k, v]) => [k, Number(v)]));
const identityVerifier = createIdentityVerifier();

const sessions = new Map<string, { walletId: string; email: string; expiresAt: number }>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const transferCooldownByWallet = new Map<string, number>();
const loginFailByEmail = new Map<string, { count: number; unlockAt: number }>();
const actionRate = new Map<string, { count: number; resetAt: number }>();
const passwordChangeCooldownByWallet = new Map<string, number>();
const securitySignalHits = new Map<string, number[]>();
const securityAlertLastEmitAt = new Map<string, number>();

const ENDPOINT_BUDGETS = {
  register: {
    ip: { maxHits: 12, windowMs: 10 * 60 * 1000 },
    account: { maxHits: 6, windowMs: 10 * 60 * 1000 },
    device: { maxHits: 8, windowMs: 10 * 60 * 1000 },
  },
  login: {
    ip: { maxHits: 20, windowMs: 10 * 60 * 1000 },
    account: { maxHits: 10, windowMs: 10 * 60 * 1000 },
    device: { maxHits: 12, windowMs: 10 * 60 * 1000 },
  },
  transfer: {
    ip: { maxHits: 25, windowMs: 60_000 },
    account: { maxHits: 20, windowMs: 60_000 },
    device: { maxHits: 20, windowMs: 60_000 },
  },
  ping: {
    ip: { maxHits: 180, windowMs: 60_000 },
    account: { maxHits: 120, windowMs: 60_000 },
    device: { maxHits: 120, windowMs: 60_000 },
  },
  walletRead: {
    ip: { maxHits: 90, windowMs: 60_000 },
    account: { maxHits: 60, windowMs: 60_000 },
    device: { maxHits: 60, windowMs: 60_000 },
  },
  ledgerRead: {
    ip: { maxHits: 60, windowMs: 60_000 },
    account: { maxHits: 30, windowMs: 60_000 },
    device: { maxHits: 30, windowMs: 60_000 },
  },
  recipientLookup: {
    ip: { maxHits: 90, windowMs: 60_000 },
    account: { maxHits: 60, windowMs: 60_000 },
    device: { maxHits: 60, windowMs: 60_000 },
  },
} as const;

app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  // Baseline security headers (minimal, framework-free hardening).
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use((req, res, next) => {
  if (req.method === "GET") {
    ensureCsrfCookie(req, res);
    ensureDeviceCookie(req, res);
  }
  next();
});

function saveState(): void {
  store.save({
    ledger: ledger.snapshot(),
    walletByEmailHash: Object.fromEntries(walletByEmailHash),
    passwordHashByEmailHash: Object.fromEntries(passwordHashByEmailHash),
    emailByWalletId: Object.fromEntries(emailByWalletId),
    emailVerifiedByWalletId: Object.fromEntries(emailVerifiedByWalletId),
    emailVerificationTokenByWalletId: Object.fromEntries(emailVerificationTokenByWalletId),
    emailVerificationTokenExpiryByWalletId: Object.fromEntries(emailVerificationTokenExpiryByWalletId),
  });
}

function parseCookies(req: express.Request): Record<string, string> {
  const raw = req.headers.cookie ?? "";
  return Object.fromEntries(raw.split(";").map((p) => p.trim()).filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    if (i <= 0) return [kv, ""];
    return [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))];
  }));
}

function getCookieOptions(maxAgeSec?: number): string {
  const secure = (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging") ? "; Secure" : "";
  const maxAge = typeof maxAgeSec === "number" ? `; Max-Age=${maxAgeSec}` : "";
  return `HttpOnly; Path=/; SameSite=Lax${secure}${maxAge}`;
}

function getReadableCookieOptions(maxAgeSec: number): string {
  const secure = (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging") ? "; Secure" : "";
  return `Path=/; SameSite=Lax${secure}; Max-Age=${maxAgeSec}`;
}

function ensureCsrfCookie(req: express.Request, res: express.Response): string {
  const existing = parseCookies(req)[CSRF_COOKIE_NAME];
  if (existing) return existing;
  const token = randomUUID();
  res.append("Set-Cookie", `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; ${getReadableCookieOptions(24 * 60 * 60)}`);
  return token;
}

function ensureDeviceCookie(req: express.Request, res: express.Response): string {
  const existing = parseCookies(req)[DEVICE_COOKIE_NAME];
  if (existing) return existing;
  const deviceId = randomUUID();
  res.append("Set-Cookie", `${DEVICE_COOKIE_NAME}=${encodeURIComponent(deviceId)}; ${getReadableCookieOptions(365 * 24 * 60 * 60)}`);
  return deviceId;
}

function requireCsrfToken(req: express.Request): void {
  const cookies = parseCookies(req);
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers["x-csrf-token"];
  const header = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!cookieToken || !header || header !== cookieToken) {
    audit("csrf_rejected", { reason: "missing_or_mismatch", path: req.path, method: req.method, ip: req.ip ?? "unknown" });
    throw new FSCError("invalid or missing CSRF token");
  }
}

function pushSecuritySignal(signalId: string, threshold: number, windowMs: number, fields: Record<string, unknown>): void {
  const now = Date.now();
  const history = securitySignalHits.get(signalId) ?? [];
  const fresh = history.filter((ts) => now - ts <= windowMs);
  fresh.push(now);
  securitySignalHits.set(signalId, fresh);

  if (fresh.length < threshold) return;

  const lastAlertAt = securityAlertLastEmitAt.get(signalId) ?? 0;
  if (now - lastAlertAt < windowMs) return;

  securityAlertLastEmitAt.set(signalId, now);
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    event: "security_alert",
    alertId: signalId,
    hitCount: fresh.length,
    threshold,
    windowMs,
    ...fields,
  }));
}

function observeSecuritySignals(event: string, fields: Record<string, unknown>): void {
  if (event === "login_failed") {
    const emailHash = String(fields.emailHash ?? "unknown");
    pushSecuritySignal(`login_failed_burst:email:${emailHash}`, 5, 10 * 60 * 1000, {
      severity: "high",
      category: "auth",
      signal: "login_failed_burst",
      emailHash,
    });
    return;
  }

  if (event === "csrf_rejected") {
    const ip = String(fields.ip ?? "unknown");
    pushSecuritySignal(`csrf_rejected_burst:ip:${ip}`, 8, 10 * 60 * 1000, {
      severity: "medium",
      category: "csrf",
      signal: "csrf_rejected_burst",
      ip,
    });
    return;
  }

  if (event === "transfer_success") {
    const fromWalletId = String(fields.fromWalletId ?? "unknown");
    pushSecuritySignal(`transfer_burst:wallet:${fromWalletId}`, 4, 10 * 60 * 1000, {
      severity: "high",
      category: "transfer",
      signal: "transfer_burst",
      walletHint: fromWalletId.slice(0, 12),
    });
    return;
  }

  if (event === "email_verification_failed") {
    const walletId = String(fields.walletId ?? "unknown");
    pushSecuritySignal(`email_verification_failed_burst:wallet:${walletId}`, 5, 10 * 60 * 1000, {
      severity: "medium",
      category: "settings",
      signal: "email_verification_failed_burst",
      walletHint: walletId.slice(0, 12),
    });
    return;
  }

  if (event === "rate_limit_hit" && String(fields.scope ?? "") === "login") {
    const dimension = String(fields.dimension ?? "unknown");
    const accountHint = String(fields.accountHint ?? "unknown");
    pushSecuritySignal(`login_rate_limit_burst:${dimension}:${accountHint}`, 3, 10 * 60 * 1000, {
      severity: "high",
      category: "auth",
      signal: "login_rate_limit_burst",
      dimension,
      accountHint,
    });
  }
}

function audit(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
  if (event !== "security_alert") observeSecuritySignals(event, fields);
}

function getSession(req: express.Request) {
  const sid = parseCookies(req)[SESSION_COOKIE_NAME];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(sid);
    audit("session_expired", { walletId: s.walletId, sid });
    return null;
  }
  return s;
}

function requireSession(req: express.Request): { walletId: string; email: string; expiresAt: number } {
  const sid = parseCookies(req)[SESSION_COOKIE_NAME];
  const s = sid ? sessions.get(sid) : null;
  if (!s) throw new FSCError("not authenticated");
  if (s.expiresAt < Date.now()) {
    sessions.delete(sid!);
    audit("session_expired", { walletId: s.walletId, sid });
    throw new FSCError("session expired");
  }
  // idle timeout resets on activity
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return s;
}

function checkRateLimit(key: string): void {
  const now = Date.now();
  const hit = authAttempts.get(key);
  if (!hit || hit.resetAt < now) {
    authAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  if (hit.count >= 20) throw new FSCError("too many attempts, try again later");
  hit.count += 1;
}

type RateDimensionBudget = {
  maxHits: number;
  windowMs: number;
};

type RateDimensionBudgets = {
  ip: RateDimensionBudget;
  account: RateDimensionBudget;
  device: RateDimensionBudget;
};

const DEFAULT_DIMENSION_BUDGETS: RateDimensionBudgets = {
  ip: { maxHits: 60, windowMs: 60_000 },
  account: { maxHits: 60, windowMs: 60_000 },
  device: { maxHits: 60, windowMs: 60_000 },
};

function checkActionLimit(key: string, maxHits: number, windowMs: number, label: string, telemetry?: { scope: string; dimension: "ip" | "account" | "device"; accountId?: string }): void {
  const now = Date.now();
  const hit = actionRate.get(key);
  if (!hit || hit.resetAt < now) {
    actionRate.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (hit.count >= maxHits) {
    const waitSec = Math.ceil((hit.resetAt - now) / 1000);
    audit("rate_limit_hit", {
      scope: telemetry?.scope,
      dimension: telemetry?.dimension,
      maxHits,
      windowMs,
      waitSec,
      accountHint: telemetry?.accountId ? telemetry.accountId.slice(0, 12) : undefined,
    });
    throw new FSCError(`${label} rate limit: wait ${waitSec}s`);
  }
  hit.count += 1;
}

function getClientDeviceId(req: express.Request): string {
  const cookies = parseCookies(req);
  const cookieDevice = cookies[DEVICE_COOKIE_NAME];
  if (cookieDevice) return cookieDevice;
  const headerVal = req.headers["x-fsc-device-id"];
  const headerDevice = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (headerDevice && String(headerDevice).trim()) return String(headerDevice).trim();
  return "unknown";
}

function checkActionLimitByDimensions(opts: {
  req: express.Request;
  scope: string;
  label: string;
  maxHits?: number;
  windowMs?: number;
  budgets?: Partial<RateDimensionBudgets>;
  accountId?: string;
  includeIp?: boolean;
  includeDevice?: boolean;
}): void {
  const includeIp = opts.includeIp ?? true;
  const includeDevice = opts.includeDevice ?? true;

  const fallbackMaxHits = opts.maxHits ?? DEFAULT_DIMENSION_BUDGETS.account.maxHits;
  const fallbackWindowMs = opts.windowMs ?? DEFAULT_DIMENSION_BUDGETS.account.windowMs;

  const ipBudget = opts.budgets?.ip ?? { maxHits: fallbackMaxHits, windowMs: fallbackWindowMs };
  const accountBudget = opts.budgets?.account ?? { maxHits: fallbackMaxHits, windowMs: fallbackWindowMs };
  const deviceBudget = opts.budgets?.device ?? { maxHits: fallbackMaxHits, windowMs: fallbackWindowMs };

  if (includeIp) {
    checkActionLimit(
      `${opts.scope}:ip:${opts.req.ip ?? "unknown"}`,
      ipBudget.maxHits,
      ipBudget.windowMs,
      `${opts.label} (ip)`,
      { scope: opts.scope, dimension: "ip", accountId: opts.accountId },
    );
  }
  if (opts.accountId) {
    checkActionLimit(
      `${opts.scope}:account:${opts.accountId}`,
      accountBudget.maxHits,
      accountBudget.windowMs,
      `${opts.label} (account)`,
      { scope: opts.scope, dimension: "account", accountId: opts.accountId },
    );
  }
  if (includeDevice) {
    checkActionLimit(
      `${opts.scope}:device:${getClientDeviceId(opts.req)}`,
      deviceBudget.maxHits,
      deviceBudget.windowMs,
      `${opts.label} (device)`,
      { scope: opts.scope, dimension: "device", accountId: opts.accountId },
    );
  }
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return "password must be at least 12 characters";
  if (!/[a-z]/.test(password)) return "password must include lowercase letters";
  if (!/[A-Z]/.test(password)) return "password must include uppercase letters";
  if (!/[0-9]/.test(password)) return "password must include numbers";
  if (!/[^A-Za-z0-9]/.test(password)) return "password must include special characters";
  if (/^(password|123456|qwerty|letmein|admin)$/i.test(password)) return "password is too common";
  return null;
}

function getLoginDelayMs(emailHash: string): number {
  const now = Date.now();
  const row = loginFailByEmail.get(emailHash);
  if (!row) return 0;
  if (row.unlockAt <= now) return 0;
  return row.unlockAt - now;
}

function recordLoginFailure(emailHash: string): number {
  const now = Date.now();
  const row = loginFailByEmail.get(emailHash) ?? { count: 0, unlockAt: 0 };
  row.count += 1;
  const delaySec = Math.min(60, Math.pow(2, Math.min(row.count, 6) - 1));
  row.unlockAt = now + delaySec * 1000;
  loginFailByEmail.set(emailHash, row);
  return delaySec;
}

function clearLoginFailure(emailHash: string): void {
  loginFailByEmail.delete(emailHash);
}

function issueEmailVerificationToken(walletId: string, ttlMs = EMAIL_VERIFICATION_TTL_SEC * 1000): string {
  const token = randomUUID();
  emailVerificationTokenByWalletId.set(walletId, token);
  emailVerificationTokenExpiryByWalletId.set(walletId, Date.now() + ttlMs);
  return token;
}

function requireSameOrigin(req: express.Request): void {
  const host = req.headers.host;
  if (!host) return;

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const isAllowed = (url: string | undefined) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.host === host;
    } catch {
      return false;
    }
  };

  // If browser headers are present, enforce same-origin.
  if ((origin && !isAllowed(origin)) || (!origin && referer && !isAllowed(referer))) {
    audit("csrf_rejected", {
      reason: "origin_policy",
      path: req.path,
      method: req.method,
      ip: req.ip ?? "unknown",
      origin: origin ?? undefined,
      referer: referer ?? undefined,
    });
    throw new FSCError("request blocked by CSRF origin policy");
  }
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FairShareCoin Foundation</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
      input, button { width: 100%; padding: .62rem; margin: .35rem 0; box-sizing: border-box; }
      button { cursor: pointer; border: 1px solid #ccc; border-radius: 8px; background: #fff; }
      button.primary { background: #111; color: #fff; border-color: #111; }
      pre { background: #f6f8fa; padding: .75rem; border-radius: 8px; overflow: auto; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
      code { background: #f6f8fa; padding: .12rem .35rem; border-radius: 6px; }
      .muted { color: #666; font-size: .92rem; }
      .hidden { display: none; }
      .top { text-align: center; margin-bottom: 1.2rem; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
      .inline { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
      .small-btn { width: auto; padding: .35rem .6rem; margin: 0; font-size: .85rem; }
      .history-box { max-height: 260px; overflow: auto; border: 1px solid #eee; border-radius: 8px; padding: .5rem; }
      .history-item { padding: .5rem; border-bottom: 1px solid #f0f0f0; }
      .history-item:last-child { border-bottom: none; }
      .status { display:inline-block; padding:.2rem .45rem; border-radius:999px; font-size:.8rem; margin-right:.4rem; }
      .status-ok { background:#e8f7ee; color:#1f7a3d; }
      .status-warn { background:#fff6e5; color:#8a5a00; }
      .status-err { background:#fdecec; color:#9b1c1c; }
      .revert-summary { border:1px dashed #ddd; border-radius:8px; padding:.6rem; margin-top:.5rem; }
      .session-timer { position: fixed; top: 10px; right: 12px; background: #111; color: #fff; padding: .4rem .6rem; border-radius: 8px; font-size: .82rem; }
      .notice { max-width: 860px; margin: .6rem auto 1rem auto; padding: .55rem .7rem; border-radius: 8px; }
      .notice-info { background:#eef6ff; color:#0d3b66; }
      .notice-warn { background:#fff6e5; color:#8a5a00; }
      .notice-err { background:#fdecec; color:#9b1c1c; }
      .left-menu { position: fixed; top: 10px; left: 12px; display:flex; gap:.35rem; background:#111; padding:.35rem; border-radius:8px; }
      .left-menu.hidden { display:none; }
      .left-menu button { width:auto; margin:0; padding:.35rem .55rem; border:1px solid #333; background:#1f1f1f; color:#fff; font-size:.8rem; }
      .left-menu button.btn-no { background:#b42318; border-color:#b42318; color:#fff; }
      .left-menu button.btn-yes { background:#0a7a36; border-color:#0a7a36; color:#fff; }
      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
      .modal-backdrop.hidden { display:none; }
      .modal { background:#fff; width:min(520px,95vw); border-radius:12px; padding:1rem; border:1px solid #ddd; }
      .btn-yes { background:#0a7a36; color:#fff; border-color:#0a7a36; }
      .btn-no { background:#b42318; color:#fff; border-color:#b42318; }
    </style>
  </head>
  <body>
    <div id="sessionTimer" class="session-timer">Session: -</div>
    <div id="leftMenu" class="left-menu hidden">
      <button type="button" onclick="showWalletSection('dashboard')">Dashboard</button>
      <button type="button" onclick="showWalletSection('settings')">Settings</button>
      <button type="button" class="btn-no" onclick="requestLogout()">Logout</button>
    </div>
    <div id="userNotice" class="notice notice-info hidden"></div>
    <div class="top">
      <h1>Welcome to FairShareCoin</h1>
      <p class="muted">Trial foundation UI — register or login to continue.</p>
    </div>

    <!-- MAIN: only REGISTER + LOGIN -->
    <div id="mainPage" class="card">
      <h3>Get Started</h3>
      <div class="actions">
        <button type="button" class="primary" onclick="showRegister()">REGISTER</button>
        <button type="button" onclick="showLogin()">LOGIN</button>
      </div>
    </div>

    <!-- REGISTER FLOW -->
    <div id="registerPage" class="card hidden">
      <h3>Register Wallet</h3>
      <p class="muted">NFC ePassport fields are manual in this trial.</p>
      <div class="row">
        <input id="passportNumber" placeholder="Passport Number" value="" autocomplete="off" />
        <input id="birthDateIso" placeholder="Birth date (YYYY-MM-DD)" value="" autocomplete="off" />
      </div>
      <div class="row">
        <input id="issuingAuthority" placeholder="Issuing Authority (e.g. SE)" value="" autocomplete="off" />
        <input id="publicPepper" placeholder="Public Pepper" value="" autocomplete="off" />
      </div>
      <div class="row">
        <input id="email" type="email" placeholder="Email" value="" autocomplete="off" />
        <input id="password" type="password" placeholder="Password" value="" autocomplete="new-password" />
      </div>
      <button type="button" id="completeRegisterBtn" class="btn-yes" onclick="registerWallet()">Complete Registration</button>
      <button type="button" id="backAfterRegisterBtn" class="hidden btn-yes" onclick="goMain()">Registration complete → Back to REGISTER / LOGIN</button>
      <button type="button" id="cancelRegisterBtn" class="btn-no" onclick="cancelRegister()">Cancel</button>
    </div>

    <!-- LOGIN FLOW -->
    <div id="loginPage" class="card hidden">
      <h3>Login</h3>
      <div class="row">
        <input id="loginEmail" type="email" placeholder="Email" value="" autocomplete="off" />
        <input id="loginPassword" type="password" placeholder="Password" value="" autocomplete="off" />
      </div>
      <button type="button" class="btn-yes" onclick="loginWallet()">Login</button>
      <button type="button" onclick="goMain()">Back</button>
    </div>

    <!-- WALLET DASHBOARD -->
    <div id="walletPage" class="hidden">
      <div class="card wallet-section section-dashboard">
        <h3>Wallet Overview</h3>
        <div><strong>Balance:</strong> <code id="currentBalance">-</code> FSC</div>
        <div><strong>Status:</strong> <code id="currentStatus">-</code></div>
        <div class="inline"><strong>Your UUID:</strong> <code id="currentWalletId">-</code></div>
      </div>

      <div class="card wallet-section section-dashboard">
        <h3>Transfer</h3>
        <p class="muted">You are sending from your logged-in wallet.</p>
        <label>Recipient lookup (UUID / email / nick)</label>
        <div class="row">
          <input id="recipientLookup" placeholder="Paste UUID or type email/nickname" value="" autocomplete="off" />
          <button type="button" onclick="lookupRecipient()">Lookup recipient</button>
        </div>
        <div id="recipientMatches" class="muted" style="margin:.2rem 0 .6rem 0"></div>
        <label>Receiver UUID</label>
        <input id="toWalletId" placeholder="Recipient UUID" value="" autocomplete="off" />
        <input id="recipientNickname" placeholder="Nickname (optional, local)" value="" autocomplete="off" onblur="syncRecipientByFields()" />
        <input id="recipientEmail" placeholder="Recipient email (optional, local)" value="" autocomplete="off" onblur="syncRecipientByFields()" />
        <input id="amountFSC" placeholder="Amount FSC (e.g. 0.000001)" value="" autocomplete="off" />
        <input id="transferMessage" placeholder="Message (optional, max 120 chars)" value="" maxlength="120" autocomplete="off" />
        <div class="row">
          <button type="button" id="saveRecipientBtn" onclick="saveRecipientProfile()">Save/Update recipient profile</button>
        </div>
        <div id="recipientSummary" class="revert-summary muted hidden"></div>
        <button type="button" class="btn-yes" onclick="transfer()">Send</button>
      </div>

      <div class="card wallet-section section-dashboard">
        <h3>Past recipients (local)</h3>
        <div id="contactsList" class="history-box muted">No recipients saved yet.</div>
        <div style="margin-top:.5rem;">
          <button type="button" class="small-btn" onclick="openFullRecipients()">Open full past recipients</button>
        </div>
      </div>

      <div class="card wallet-section section-dashboard">
        <h3>Transfer History</h3>
        <div id="transferHistory" class="history-box muted">No transfers yet.</div>
        <div style="margin-top:.5rem;">
          <button type="button" class="small-btn" onclick="openFullHistory()">Open full history</button>
        </div>
      </div>

      <div class="card wallet-section section-settings hidden">
        <h3>Settings</h3>
        <div class="inline"><strong>Recovery email:</strong> <code id="currentEmail">-</code> <button type="button" id="toggleEmailBtn" class="small-btn" onclick="toggleEmail()">Show full email</button></div>
        <div class="inline" style="margin-top:.4rem;"><strong>Email verification:</strong> <code id="emailVerificationStatus">-</code></div>
        <div class="row" style="margin-top:.5rem; align-items:flex-end; gap:.5rem; flex-wrap:wrap;">
          <button type="button" class="small-btn" onclick="requestEmailVerification()">Request verification token</button>
          <input id="emailVerificationToken" placeholder="Paste verification token (UUID)" value="" autocomplete="off" style="min-width:260px;" />
          <button type="button" class="btn-yes" onclick="confirmEmailVerification()">Verify email</button>
        </div>
        <p class="muted" style="margin-top:.8rem;">Change password (current password required).</p>
        <input id="currentPassword" type="password" placeholder="Current password" value="" autocomplete="current-password" />
        <input id="newPassword" type="password" placeholder="New password" value="" autocomplete="new-password" />
        <input id="confirmNewPassword" type="password" placeholder="Confirm new password" value="" autocomplete="new-password" />
        <button type="button" class="btn-yes" onclick="changePassword()">Change password</button>
      </div>

    </div>

    <div id="transferConfirmModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Confirm transfer</h3>
        <div id="transferConfirmText" class="muted" style="margin:.5rem 0 1rem 0"></div>
        <div class="row">
          <button type="button" id="confirmSendBtn" class="btn-yes" onclick="confirmTransferYes()">YES, SEND</button>
          <button type="button" id="confirmCancelBtn" class="btn-no" onclick="confirmTransferNo()">NO, CANCEL</button>
        </div>
      </div>
    </div>

    <div id="errorModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Transfer not sent</h3>
        <div id="errorModalText" class="muted" style="margin:.5rem 0 1rem 0"></div>
        <button type="button" class="primary" onclick="closeErrorModal()">OK</button>
      </div>
    </div>

    <div id="successModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3 id="successModalTitle">Success</h3>
        <div id="successModalText" class="muted" style="margin:.5rem 0 1rem 0"></div>
        <button type="button" class="btn-yes" onclick="closeSuccessModal()">OK</button>
      </div>
    </div>

    <div id="logoutConfirmModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Confirm logout</h3>
        <div class="muted" style="margin:.5rem 0 1rem 0">Log out now?</div>
        <div class="row">
          <button type="button" class="btn-yes" onclick="confirmLogoutYes()">YES, LOGOUT</button>
          <button type="button" class="btn-no" onclick="confirmLogoutNo()">NO, STAY</button>
        </div>
      </div>
    </div>

    <div id="unsavedRecipientModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Unsaved recipient changes</h3>
        <div class="muted" style="margin:.5rem 0 1rem 0">You changed recipient fields but did not save. Discard changes and continue?</div>
        <div class="row">
          <button type="button" class="btn-no" onclick="confirmUnsavedRecipientYes()">YES, DISCARD</button>
          <button type="button" class="btn-yes" onclick="confirmUnsavedRecipientNo()">NO, STAY</button>
        </div>
      </div>
    </div>

    <div id="sessionExpiredModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Session expired</h3>
        <div class="muted" style="margin:.5rem 0 1rem 0">Your session expired due to inactivity. Please log in again.</div>
        <button type="button" class="btn-yes" onclick="closeSessionExpiredModal()">Go to login</button>
      </div>
    </div>

    <div id="passwordConfirmModal" class="modal-backdrop hidden">
      <div class="modal">
        <h3>Confirm password change</h3>
        <div class="muted" style="margin:.5rem 0 1rem 0">Apply new password now?</div>
        <div class="row">
          <button type="button" class="btn-yes" onclick="confirmPasswordChangeYes()">YES, logout all sessions</button>
          <button type="button" class="btn-no" onclick="confirmPasswordChangeNo()">NO, cancel</button>
        </div>
      </div>
    </div>

    <div id="debugPanel" class="hidden">
      <h3>Response (debug)</h3>
      <pre id="output">Ready.</pre>
    </div>

    <script>
      const out = document.getElementById('output');
      const debugPanelEl = document.getElementById('debugPanel');
      const pages = {
        main: document.getElementById('mainPage'),
        register: document.getElementById('registerPage'),
        login: document.getElementById('loginPage'),
        wallet: document.getElementById('walletPage'),
      };

      const currentWalletEl = document.getElementById('currentWalletId');
      const currentBalanceEl = document.getElementById('currentBalance');
      const currentStatusEl = document.getElementById('currentStatus');
      const currentEmailEl = document.getElementById('currentEmail');
      const emailVerificationStatusEl = document.getElementById('emailVerificationStatus');
      const toggleUuidBtn = document.getElementById('toggleUuidBtn');
      const toggleEmailBtn = document.getElementById('toggleEmailBtn');
      const backAfterRegisterBtn = document.getElementById('backAfterRegisterBtn');
      const completeRegisterBtn = document.getElementById('completeRegisterBtn');
      const cancelRegisterBtn = document.getElementById('cancelRegisterBtn');
      const transferHistoryEl = document.getElementById('transferHistory');
      const recipientSummaryEl = document.getElementById('recipientSummary');
      const sessionTimerEl = document.getElementById('sessionTimer');
      const userNoticeEl = document.getElementById('userNotice');
      const saveRecipientBtn = document.getElementById('saveRecipientBtn');
      const leftMenuEl = document.getElementById('leftMenu');
      const transferConfirmModalEl = document.getElementById('transferConfirmModal');
      const transferConfirmTextEl = document.getElementById('transferConfirmText');
      const confirmSendBtn = document.getElementById('confirmSendBtn');
      const errorModalEl = document.getElementById('errorModal');
      const errorModalTextEl = document.getElementById('errorModalText');
      const successModalEl = document.getElementById('successModal');
      const successModalTitleEl = document.getElementById('successModalTitle');
      const successModalTextEl = document.getElementById('successModalText');
      const logoutConfirmModalEl = document.getElementById('logoutConfirmModal');
      const unsavedRecipientModalEl = document.getElementById('unsavedRecipientModal');
      const sessionExpiredModalEl = document.getElementById('sessionExpiredModal');
      const passwordConfirmModalEl = document.getElementById('passwordConfirmModal');

      let sessionWallet = null;
      let sessionEmail = null;
      let sessionEmailVerified = false;
      let uuidVisible = false;
      let emailVisible = false;
      let recipientSummaryEvents = [];
      let sessionExpiresAtMs = null;
      let clientSessionTtlSec = 900;
      let loginFailCount = 0;
      let lastPingAt = 0;
      let lastRecipientSaveAt = 0;
      let saveRecipientCooldownTimer = null;
      let noticeTimer = null;
      let sessionExpiredHandled = false;
      let pendingTransfer = null;
      let transferConfirmTimer = null;
      let pendingPasswordChange = null;
      let successModalLogoutPending = false;
      let recipientDraftSnapshot = { uuid: '', nickname: '', email: '' };
      let pendingRecipientNavigation = null;
      const DEBUG_UI = ${DEBUG_UI_ENABLED ? "true" : "false"};

      if (!DEBUG_UI && debugPanelEl) debugPanelEl.classList.add('hidden');
      if (DEBUG_UI && debugPanelEl) debugPanelEl.classList.remove('hidden');
      const show = (x) => {
        if (!DEBUG_UI) return;
        out.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
      };

      function getCookie(name) {
        const parts = (document.cookie || '').split(';').map((x) => x.trim());
        const row = parts.find((x) => x.startsWith(name + '='));
        return row ? decodeURIComponent(row.slice(name.length + 1)) : '';
      }

      const __nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const opts = init || {};
        const method = String(opts.method || 'GET').toUpperCase();
        const headers = new Headers(opts.headers || {});
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          const token = getCookie('fsc_csrf');
          if (token && !headers.has('x-csrf-token')) headers.set('x-csrf-token', token);
        }
        return __nativeFetch(input, { ...opts, headers });
      };

      function showNotice(kind, msg, timeoutMs) {
        const cls = kind === 'err' ? 'notice-err' : kind === 'warn' ? 'notice-warn' : 'notice-info';
        userNoticeEl.className = 'notice ' + cls;
        userNoticeEl.classList.remove('hidden');
        userNoticeEl.textContent = msg;

        if (noticeTimer) {
          clearTimeout(noticeTimer);
          noticeTimer = null;
        }

        const autoMs = typeof timeoutMs === 'number' ? timeoutMs : (kind === 'info' ? 5000 : null);
        if (autoMs) {
          noticeTimer = setTimeout(() => {
            clearNotice();
          }, autoMs);
        }
      }

      function clearNotice() {
        if (noticeTimer) {
          clearTimeout(noticeTimer);
          noticeTimer = null;
        }
        userNoticeEl.classList.add('hidden');
        userNoticeEl.textContent = '';
      }

      function parseErrorMessage(err) {
        const raw = String(err?.message || err || 'Error');

        function fieldHint(field) {
          const hints = {
            passportNumber: 'Passport number is required (example: X1234567).',
            birthDateIso: 'Birth date must be YYYY-MM-DD (example: 1990-01-01).',
            issuingAuthority: 'Issuing authority is required (example: SE).',
            publicPepper: 'Public pepper is required (minimum 8 chars, example: fairsharecoin-public-pepper).',
            email: 'Email format is invalid (example: name@example.com).',
            password: 'Password must be at least 12 chars with upper/lower/number/special (example: Fjord!Cloud#29).',
            loginPassword: 'Password is required.',
            toWalletId: 'Receiver UUID is invalid (example: 123e4567-e89b-12d3-a456-426614174000).',
            amountFSC: 'Amount must be a positive number (example: 0.1 or 0,1).',
            currentPassword: 'Current password is required.',
            newPassword: 'New password must be at least 12 chars with upper/lower/number/special (example: Fjord!Cloud#29).',
            monthDay: 'Date must be MM-DD (example: 02-24).',
          };
          return hints[field] || null;
        }

        try {
          const obj = JSON.parse(raw.replace(/^Error:\s*/, ''));
          if (typeof obj?.error === 'string') {
            if (obj.error.includes('insufficient funds')) return 'Insufficient balance. You cannot send more than your current wallet balance.';
            if (obj.error.includes('amountFSC')) return fieldHint('amountFSC');
            if (obj.error.includes('birthDateIso')) return fieldHint('birthDateIso');
            if (obj.error.includes('email')) return fieldHint('email');
            return obj.error;
          }

          if (Array.isArray(obj?.error) && obj.error.length) {
            const first = obj.error[0] || {};
            const field = Array.isArray(first.path) ? first.path[first.path.length - 1] : '';
            const hint = fieldHint(String(field || ''));
            if (hint) return hint;

            const txt = JSON.stringify(obj.error);
            if (txt.includes('amountFSC')) return fieldHint('amountFSC');
            if (txt.includes('birthDateIso')) return fieldHint('birthDateIso');
            if (txt.includes('newPassword') || txt.includes('currentPassword')) return fieldHint('newPassword');
            if (txt.includes('email')) return fieldHint('email');
            return 'One or more fields are invalid. Please review your input values.';
          }
        } catch {}

        const cleaned = raw.replace(/^Error:\s*/, '');
        if (cleaned.includes('insufficient funds')) return 'Insufficient balance. You cannot send more than your current wallet balance.';
        if (cleaned.includes('amountFSC')) return fieldHint('amountFSC');
        if (cleaned.includes('birthDateIso')) return fieldHint('birthDateIso');
        if (cleaned.includes('newPassword') || cleaned.includes('currentPassword') || cleaned.includes('too_small')) return fieldHint('newPassword');
        if (cleaned.includes('email')) return fieldHint('email');
        return cleaned;
      }

      async function touchSession(force) {
        if (!sessionWallet) return;
        const now = Date.now();
        sessionExpiresAtMs = now + (clientSessionTtlSec * 1000);
        renderSessionTimer();
        if (!force && now - lastPingAt < 30000) return;
        lastPingAt = now;
        try {
          const r = await fetch('/session/ping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const j = await r.json().catch(() => null);
          if (j?.sessionTtlSec) clientSessionTtlSec = j.sessionTtlSec;
        } catch {}
      }

      function renderSessionTimer() {
        if (!sessionExpiresAtMs) {
          sessionTimerEl.textContent = 'Session: not logged in';
          return;
        }
        const rawMs = sessionExpiresAtMs - Date.now();
        const ms = Math.max(0, rawMs);
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        sessionTimerEl.textContent = 'Session: ' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

        if (rawMs <= 0 && sessionWallet && !sessionExpiredHandled) {
          sessionExpiredHandled = true;
          handleSessionExpired();
        }
      }
      async function handleSessionExpired() {
        try { await fetch('/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch {}

        successModalLogoutPending = false;
        closeTransferModal();
        pendingTransfer = null;
        pendingPasswordChange = null;
        pendingRecipientNavigation = null;
        sessionWallet = null;
        sessionEmail = null;
        sessionEmailVerified = false;
        sessionExpiresAtMs = null;
        renderSessionTimer();
        renderIdentityFields();

        document.getElementById('toWalletId').value = '';
        document.getElementById('recipientLookup').value = '';
        document.getElementById('recipientMatches').textContent = '';
        document.getElementById('recipientNickname').value = '';
        document.getElementById('recipientEmail').value = '';
        document.getElementById('transferMessage').value = '';
        markRecipientDraftSaved();

        closeErrorModal();
        closeSuccessModal();
        closePasswordConfirmModal();
        logoutConfirmModalEl.classList.add('hidden');
        unsavedRecipientModalEl.classList.add('hidden');
        showSessionExpiredModal();
      }

      function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
      }

      function contactsKey() {
        return sessionWallet ? ('fsc.contacts.' + sessionWallet) : null;
      }

      function loadContacts() {
        const key = contactsKey();
        if (!key) return [];
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }

      function saveContacts(items) {
        const key = contactsKey();
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(items));
      }

      function norm(v) {
        return String(v || '').trim().toLowerCase();
      }

      function findContactMatches(query) {
        const q = norm(query);
        if (!q) return [];
        return loadContacts().filter((c) => {
          const u = norm(c.uuid);
          const n = norm(c.nickname);
          const e = norm(c.email);
          return u === q || e === q || n === q || u.includes(q) || e.includes(q) || n.includes(q);
        });
      }

      function upsertContact(uuid, nickname, email) {
        const trimmedUuid = (uuid || '').trim();
        if (!trimmedUuid) return;

        const contacts = loadContacts();
        const idx = contacts.findIndex((c) => c.uuid === trimmedUuid);
        const item = {
          uuid: trimmedUuid,
          nickname: (nickname || '').trim(),
          email: (email || '').trim(),
        };

        if (idx >= 0) {
          contacts.splice(idx, 1);
        }
        contacts.unshift(item);
        saveContacts(contacts.slice(0, 30));
      }

      function removeContact(uuid) {
        const trimmedUuid = (uuid || '').trim();
        if (!trimmedUuid) return;
        const contacts = loadContacts().filter((c) => c.uuid !== trimmedUuid);
        saveContacts(contacts);
      }

      function fillRecipientFromContact(uuid) {
        const c = contactByUuid(uuid);
        document.getElementById('toWalletId').value = uuid;
        document.getElementById('recipientNickname').value = c?.nickname || '';
        document.getElementById('recipientEmail').value = c?.email || '';
        markRecipientDraftSaved();
        // keep lookup input unchanged (user-entered query)
      }

      function hideRevertSummary() {
        recipientSummaryEl.classList.add('hidden');
        recipientSummaryEl.textContent = '';
        recipientSummaryEvents = [];
      }

      function addRecipientSummaryEvent(action, diff) {
        const ts = new Date().toLocaleString();
        recipientSummaryEvents.unshift({ action, ts, diff });
        recipientSummaryEvents = recipientSummaryEvents.slice(0, 8);

        recipientSummaryEl.classList.remove('hidden');
        recipientSummaryEl.classList.remove('muted');
        recipientSummaryEl.innerHTML = '<strong>Recipient Save/Update Summary</strong>'
          + recipientSummaryEvents.map((e) =>
            '<div style="margin-top:.45rem; padding-top:.45rem; border-top:1px solid #eee;">'
            + '<span class="muted">' + escapeHtml(e.ts) + '</span> · <strong>' + escapeHtml(e.action) + '</strong>'
            + '<br/>UUID: <code>' + escapeHtml(maskUuid(e.diff.uuid || '')) + '</code>'
            + '<br/>Before → nick: <code>' + escapeHtml(e.diff.before.nickname || '-') + '</code>, mail: <code>' + escapeHtml(e.diff.before.email || '-') + '</code>, exists: <code>' + String(e.diff.before.exists) + '</code>'
            + '<br/>After → nick: <code>' + escapeHtml(e.diff.after.nickname || '-') + '</code>, mail: <code>' + escapeHtml(e.diff.after.email || '-') + '</code>, exists: <code>' + String(e.diff.after.exists) + '</code>'
            + '</div>'
          ).join('');
      }

      function setLookupStatus(kind, msg) {
        const el = document.getElementById('recipientMatches');
        const cls = kind === 'ok' ? 'status-ok' : kind === 'warn' ? 'status-warn' : 'status-err';
        const label = kind === 'ok' ? 'Exact local match' : kind === 'warn' ? 'Multiple local matches' : 'No match';
        el.innerHTML = '<span class="status ' + cls + '">' + label + '</span>' + escapeHtml(msg || '');
      }

      function renderRecipientMatches(matches) {
        const el = document.getElementById('recipientMatches');
        if (!matches.length) {
          setLookupStatus('err', 'No local recipient match found.');
          return;
        }
        const header = '<div><span class="status status-warn">Multiple local matches</span>Choose one recipient:</div>';
        el.innerHTML = header + matches.map((c) => {
          const name = escapeHtml(c.nickname || '-');
          const mail = escapeHtml(c.email ? maskEmail(c.email) : '-');
          const uuidM = escapeHtml(maskUuid(c.uuid));
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin:.2rem 0;">'
            + '<span>' + name + ' · ' + mail + ' · <code>' + uuidM + '</code></span>'
            + '<button type="button" class="small-btn" data-uuid="' + escapeHtml(c.uuid) + '" onclick="selectRecipient(this.dataset.uuid)">Use</button>'
            + '</div>';
        }).join('');
      }

      function selectRecipient(uuid) {
        fillRecipientFromContact(uuid);
        setLookupStatus('ok', 'Recipient selected.');
      }

      async function lookupRecipient() {
        try {
          await touchSession(true);
          const q = document.getElementById('recipientLookup').value.trim();
          if (!q) {
            setLookupStatus('err', 'Enter UUID, email, or nickname to lookup.');
            return;
          }

          const matches = findContactMatches(q);
          if (matches.length === 1) {
            fillRecipientFromContact(matches[0].uuid);
            setLookupStatus('ok', 'Matched 1 local recipient and populated fields.');
            return;
          }
          if (matches.length > 1) {
            renderRecipientMatches(matches);
            return;
          }

          // No local match: if input looks like UUID, validate against network and populate UUID field.
          const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
          if (!looksUuid) {
            setLookupStatus('err', 'No local match. For unknown recipients, paste full UUID.');
            return;
          }

          const res = await api('/recipient/' + encodeURIComponent(q));
          if (!res.exists) {
            setLookupStatus('err', 'UUID not found in network.');
            return;
          }

          document.getElementById('toWalletId').value = q;
          setLookupStatus('warn', 'UUID exists in network, but no local nick/email saved yet.');
        } catch (e) { show(String(e)); }
      }

      function syncRecipientByFields() {
        const uuid = document.getElementById('toWalletId').value.trim();
        if (uuid) return;
        const email = document.getElementById('recipientEmail').value;
        const nick = document.getElementById('recipientNickname').value;
        const matches = findContactMatches(email || nick);
        if (matches.length === 1) {
          fillRecipientFromContact(matches[0].uuid);
          setLookupStatus('ok', 'Auto-matched recipient from local contacts.');
        }
      }

      function useRecipient(uuid) {
        fillRecipientFromContact(uuid);
      }

      function renderContacts() {
        const el = document.getElementById('contactsList');
        const contacts = loadContacts();
        if (!contacts.length) {
          el.innerHTML = '<span class="muted">No recipients saved yet.</span>';
          return;
        }

        const latest = contacts.slice(0, 10);
        el.innerHTML = latest.map((c) => {
          const name = c.nickname || 'Recipient';
          const masked = maskUuid(c.uuid);
          const maskedEmail = c.email ? maskEmail(c.email) : '-';
          return '<div style="display:flex; justify-content:space-between; align-items:center; gap:.5rem; margin:.35rem 0;">'
            + '<div><strong>' + escapeHtml(name) + '</strong><br/><code>' + escapeHtml(masked) + '</code> · <code>' + escapeHtml(maskedEmail) + '</code></div>'
            + '<button type="button" class="small-btn" data-uuid="' + escapeHtml(c.uuid) + '" onclick="useRecipient(this.dataset.uuid)">Use/Edit</button>'
            + '</div>';
        }).join('');
      }

      function formatPicoToFsc(picoStr) {
        try {
          const pico = BigInt(String(picoStr || '0'));
          const whole = pico / 1000000000000n;
          const fracRaw = (pico % 1000000000000n).toString().padStart(12, '0').replace(/0+$/, '');
          return fracRaw ? (whole.toString() + '.' + fracRaw) : whole.toString();
        } catch {
          return '0';
        }
      }

      function contactByUuid(uuid) {
        return loadContacts().find((c) => c.uuid === uuid);
      }

      function copyText(value) {
        navigator.clipboard?.writeText(value).then(() => show('Copied to clipboard')).catch(() => {});
      }

      function renderTransferHistory(items) {
        if (!items.length) {
          transferHistoryEl.innerHTML = '<span class="muted">No transfers yet.</span>';
          return;
        }

        transferHistoryEl.innerHTML = items.map((tx) => {
          const counterparty = tx.direction === 'OUT' ? tx.toWalletId : tx.fromWalletId;
          const c = contactByUuid(counterparty || '');
          const nick = c?.nickname ? escapeHtml(c.nickname) : '-';
          const mail = c?.email ? escapeHtml(maskEmail(c.email)) : '-';
          const uuidMasked = counterparty ? escapeHtml(maskUuid(counterparty)) : '-';
          return '<div class="history-item">'
            + '<strong>' + tx.direction + '</strong> · ' + escapeHtml(tx.amountFSC) + ' FSC'
            + '<br/><span class="muted">' + escapeHtml(tx.at) + '</span>'
            + '<br/><span class="muted">nick: ' + nick + ' · mail: ' + mail + ' · uuid: ' + uuidMasked + '</span>'
            + (tx.message ? '<br/><span class="muted">msg: ' + escapeHtml(tx.message) + '</span>' : '')
            + '</div>';
        }).join('');
      }

      async function refreshTransferHistory(limit) {
        if (!sessionWallet) {
          renderTransferHistory([]);
          return;
        }
        const allRes = await api('/ledger?limit=500&offset=0');
        const all = Array.isArray(allRes) ? allRes : (allRes.items || []);
        const filtered = all
          .filter((e) => e.type === 'TRANSFER' && (e.fromWalletId === sessionWallet || e.toWalletId === sessionWallet))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .map((e) => ({
            at: new Date(e.at).toLocaleString(),
            direction: e.fromWalletId === sessionWallet ? 'OUT' : 'IN',
            fromWalletId: e.fromWalletId,
            toWalletId: e.toWalletId,
            amountFSC: formatPicoToFsc(e.amountPico || '0'),
            message: e.metadata?.message || '',
          }));

        renderTransferHistory(typeof limit === 'number' ? filtered.slice(0, limit) : filtered);
      }

      function openFullHistory() {
        if (!sessionWallet) return;
        window.open('/history?walletId=' + encodeURIComponent(sessionWallet), '_blank');
      }

      function openFullRecipients() {
        if (!sessionWallet) return;
        window.open('/recipients?walletId=' + encodeURIComponent(sessionWallet), '_blank');
      }

      function currentRecipientDraft() {
        return {
          uuid: String(document.getElementById('toWalletId')?.value || '').trim(),
          nickname: String(document.getElementById('recipientNickname')?.value || '').trim(),
          email: String(document.getElementById('recipientEmail')?.value || '').trim(),
        };
      }

      function markRecipientDraftSaved() {
        recipientDraftSnapshot = currentRecipientDraft();
      }

      function restoreRecipientDraftSnapshot() {
        const s = recipientDraftSnapshot || { uuid: '', nickname: '', email: '' };
        document.getElementById('toWalletId').value = s.uuid || '';
        document.getElementById('recipientNickname').value = s.nickname || '';
        document.getElementById('recipientEmail').value = s.email || '';
      }

      function hasUnsavedRecipientDraft() {
        if (!sessionWallet) return false;
        const a = currentRecipientDraft();
        const b = recipientDraftSnapshot || { uuid: '', nickname: '', email: '' };
        return a.uuid !== b.uuid || a.nickname !== b.nickname || a.email !== b.email;
      }

      function openUnsavedRecipientModal(nextAction) {
        pendingRecipientNavigation = nextAction;
        unsavedRecipientModalEl.classList.remove('hidden');
      }

      function closeUnsavedRecipientModal() {
        unsavedRecipientModalEl.classList.add('hidden');
      }

      function confirmUnsavedRecipientYes() {
        restoreRecipientDraftSnapshot();
        closeUnsavedRecipientModal();
        const act = pendingRecipientNavigation;
        pendingRecipientNavigation = null;
        if (typeof act === 'function') act();
      }

      function confirmUnsavedRecipientNo() {
        pendingRecipientNavigation = null;
        closeUnsavedRecipientModal();
      }

      function showWalletSection(section) {
        if (section !== 'dashboard' && hasUnsavedRecipientDraft()) {
          openUnsavedRecipientModal(() => showWalletSection(section));
          return;
        }
        const dashboard = document.querySelectorAll('.section-dashboard');
        const settings = document.querySelectorAll('.section-settings');
        dashboard.forEach((el) => el.classList.toggle('hidden', section !== 'dashboard'));
        settings.forEach((el) => el.classList.toggle('hidden', section !== 'settings'));
      }

      function setPage(name) {
        Object.values(pages).forEach((p) => p.classList.add('hidden'));
        pages[name].classList.remove('hidden');
        if (name === 'wallet') {
          leftMenuEl.classList.remove('hidden');
          showWalletSection('dashboard');
        } else {
          leftMenuEl.classList.add('hidden');
        }
      }

      function guardUnsavedRecipient(nextAction) {
        if (hasUnsavedRecipientDraft()) {
          openUnsavedRecipientModal(nextAction);
          return;
        }
        nextAction();
      }

      function clearLoginFields() {
        const emailEl = document.getElementById('loginEmail');
        const passEl = document.getElementById('loginPassword');
        if (emailEl) emailEl.value = '';
        if (passEl) passEl.value = '';
      }

      function goMain() { clearNotice(); clearLoginFields(); guardUnsavedRecipient(() => setPage('main')); }
      function showRegister() {
        backAfterRegisterBtn.classList.add('hidden');
        completeRegisterBtn.classList.remove('hidden');
        cancelRegisterBtn.classList.remove('hidden');
        guardUnsavedRecipient(() => setPage('register'));
      }
      function showLogin() { clearLoginFields(); guardUnsavedRecipient(() => setPage('login')); }

      function parseAmountFsc(input) {
        const normalized = String(input || '').trim().replace(',', '.');
        if (!normalized) return NaN;
        return Number(normalized);
      }

      function closeTransferModal() {
        transferConfirmModalEl.classList.add('hidden');
        if (transferConfirmTimer) {
          clearInterval(transferConfirmTimer);
          transferConfirmTimer = null;
        }
      }

      function showErrorModal(msg) {
        errorModalTextEl.textContent = msg;
        errorModalEl.classList.remove('hidden');
      }

      function closeErrorModal() {
        errorModalEl.classList.add('hidden');
      }

      function showSuccessModal(title, msg) {
        successModalTitleEl.textContent = title || 'Success';
        successModalTextEl.textContent = msg;
        successModalEl.classList.remove('hidden');
      }

      async function closeSuccessModal() {
        successModalEl.classList.add('hidden');
        if (successModalLogoutPending) {
          successModalLogoutPending = false;
          await logout();
        }
      }

      function requestLogout() {
        if (hasUnsavedRecipientDraft()) {
          openUnsavedRecipientModal(() => requestLogout());
          return;
        }
        logoutConfirmModalEl.classList.remove('hidden');
      }

      function confirmLogoutYes() {
        logoutConfirmModalEl.classList.add('hidden');
        logout();
      }

      function confirmLogoutNo() {
        logoutConfirmModalEl.classList.add('hidden');
      }

      function showSessionExpiredModal() {
        sessionExpiredModalEl.classList.remove('hidden');
      }

      function closeSessionExpiredModal() {
        sessionExpiredModalEl.classList.add('hidden');
        clearLoginFields();
        setPage('login');
      }

      function openPasswordConfirmModal(payload) {
        pendingPasswordChange = payload;
        passwordConfirmModalEl.classList.remove('hidden');
      }

      function closePasswordConfirmModal() {
        passwordConfirmModalEl.classList.add('hidden');
      }

      async function confirmPasswordChangeYes() {
        if (!pendingPasswordChange) return;
        const payload = pendingPasswordChange;
        pendingPasswordChange = null;
        closePasswordConfirmModal();
        try {
          const res = await api('/settings/change-password', { currentPassword: payload.currentPassword, newPassword: payload.newPassword });
          document.getElementById('currentPassword').value = '';
          document.getElementById('newPassword').value = '';
          document.getElementById('confirmNewPassword').value = '';
          show(res);
          successModalLogoutPending = true;
          showSuccessModal('Password changed', 'Password updated successfully. You will now be logged out from all sessions.');
        } catch (e) {
          const msg = parseErrorMessage(e);
          showNotice('warn', msg);
          show(String(e));
        }
      }

      function confirmPasswordChangeNo() {
        pendingPasswordChange = null;
        closePasswordConfirmModal();
        showNotice('info', 'Password change cancelled.');
      }

      function openTransferModal(payload) {
        pendingTransfer = payload;
        let left = 10;
        transferConfirmTextEl.textContent = 'Send ' + payload.amountFSC + ' FSC to ' + maskUuid(payload.toWalletId) + '?' + (payload.transferMessage ? (' Message: "' + payload.transferMessage + '"') : '');
        confirmSendBtn.textContent = 'YES, SEND (' + left + 's)';
        transferConfirmModalEl.classList.remove('hidden');

        if (transferConfirmTimer) clearInterval(transferConfirmTimer);
        transferConfirmTimer = setInterval(() => {
          left -= 1;
          if (left > 0) {
            confirmSendBtn.textContent = 'YES, SEND (' + left + 's)';
          } else {
            closeTransferModal();
            pendingTransfer = null;
            showErrorModal('Confirmation timed out after 10 seconds. Transfer not sent.');
          }
        }, 1000);
      }

      function confirmTransferNo() {
        closeTransferModal();
        pendingTransfer = null;
        showNotice('info', 'Transfer cancelled.');
      }

      async function confirmTransferYes() {
        if (!pendingTransfer) return;
        const payload = pendingTransfer;
        closeTransferModal();
        pendingTransfer = null;

        try {
          const res = await api('/transfer', {
            fromWalletId: payload.fromWalletId,
            toWalletId: payload.toWalletId,
            amountFSC: payload.amountFSC,
            message: payload.transferMessage || undefined,
          });
          clearNotice();
          upsertContact(payload.toWalletId, payload.nickname, payload.recipientEmail);
          renderContacts();
          document.getElementById('recipientMatches').textContent = '';
          show(res);
          showSuccessModal('Transfer sent', 'Transfer sent successfully to ' + maskUuid(payload.toWalletId) + ' for ' + payload.amountFSC + ' FSC.');
          await fetchWallet();
        } catch (e) {
          const msg = parseErrorMessage(e);
          const m = msg.toLowerCase();
          if (m.includes('insufficient balance') || m.includes('minimum transfer') || m.includes('amount')) {
            showErrorModal(msg + ' Transfer not sent.');
          } else {
            showNotice('warn', msg);
          }
          show(String(e));
        }
      }
      function cancelRegister() {
        // Explicitly cancel and reset register flow without submitting anything.
        backAfterRegisterBtn.classList.add('hidden');
        setPage('main');
        show('Registration cancelled. No wallet created.');
      }

      async function api(path, body) {
        const r = await fetch(path, {
          method: body ? 'POST' : 'GET',
          headers: { 'content-type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(JSON.stringify(j));
        await touchSession(false);
        return j;
      }

      function maskEmail(email) {
        if (!email || !email.includes('@')) return '-';
        const [local, domain] = email.split('@');
        const keep = Math.min(2, local.length);
        const maskedLocal = local.slice(0, keep) + '*'.repeat(Math.max(2, local.length - keep));
        return maskedLocal + '@' + domain;
      }

      function maskUuid(uuid) {
        if (!uuid || uuid.length < 8) return '-';
        return uuid.slice(0, 8) + '-****-****-****-' + uuid.slice(-4);
      }

      function renderIdentityFields() {
        currentWalletEl.textContent = sessionWallet ? maskUuid(sessionWallet) : '-';
        currentEmailEl.textContent = sessionEmail ? (emailVisible ? sessionEmail : maskEmail(sessionEmail)) : '-';
        if (toggleEmailBtn) toggleEmailBtn.textContent = emailVisible ? 'Hide email' : 'Show full email';
        if (emailVerificationStatusEl) {
          emailVerificationStatusEl.textContent = sessionWallet ? (sessionEmailVerified ? 'Verified' : 'Not verified') : '-';
        }
      }

      function toggleUuid() {
        // UUID reveal intentionally disabled in UI to limit identity exposure.
        renderIdentityFields();
      }

      function toggleEmail() {
        if (!sessionEmail) return;
        emailVisible = !emailVisible;
        renderIdentityFields();
      }

      function setCurrentWallet(wallet) {
        sessionWallet = wallet.walletId;
        sessionEmail = wallet.email || sessionEmail;
        sessionEmailVerified = Boolean(wallet.emailVerified);
        sessionExpiredHandled = false;
        clientSessionTtlSec = wallet.sessionTtlSec || 900;
        sessionExpiresAtMs = Date.now() + (clientSessionTtlSec * 1000);
        renderSessionTimer();
        uuidVisible = false;
        emailVisible = false;
        renderIdentityFields();
        renderContacts();
        refreshTransferHistory(10).catch(() => {});
        hideRevertSummary();
        lastRecipientSaveAt = 0;
        if (saveRecipientCooldownTimer) { clearInterval(saveRecipientCooldownTimer); saveRecipientCooldownTimer = null; }
        if (saveRecipientBtn) {
          saveRecipientBtn.disabled = false;
          saveRecipientBtn.textContent = 'Save/Update recipient profile';
        }

        currentBalanceEl.textContent = wallet.balanceFSC;
        currentStatusEl.textContent = wallet.status;
        markRecipientDraftSaved();
      }

      async function fetchWallet() {
        try {
          const id = sessionWallet;
          if (!id) return;
          const wallet = await api('/wallet/' + id);
          setCurrentWallet(wallet);
          show(wallet);
        } catch (e) { show(String(e)); }
      }

      function isValidEmail(v) {
        return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v || '').trim());
      }

      function isValidUuid(v) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim());
      }

      function isValidBirthDate(v) {
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(v || '').trim())) return false;
        const d = new Date(v + 'T00:00:00Z');
        return !Number.isNaN(d.getTime());
      }

      async function registerWallet() {
        try {
          const payload = {
            passportNumber: document.getElementById('passportNumber').value,
            birthDateIso: document.getElementById('birthDateIso').value,
            issuingAuthority: document.getElementById('issuingAuthority').value,
            publicPepper: document.getElementById('publicPepper').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          };
          if (!payload.passportNumber || payload.passportNumber.trim().length < 3) {
            showNotice('warn', 'Passport number is required (example: X1234567).');
            return;
          }
          if (!isValidBirthDate(payload.birthDateIso)) {
            showNotice('warn', 'Birth date must be YYYY-MM-DD (example: 1990-01-01).');
            return;
          }
          if (!payload.issuingAuthority || payload.issuingAuthority.trim().length < 2) {
            showNotice('warn', 'Issuing authority is required (example: SE).');
            return;
          }
          if (!payload.publicPepper || payload.publicPepper.trim().length < 8) {
            showNotice('warn', 'Public pepper is required (minimum 8 chars, example: fairsharecoin-public-pepper).');
            return;
          }
          if (!isValidEmail(payload.email)) {
            showNotice('warn', 'Email format is invalid (example: name@example.com).');
            return;
          }
          if (!payload.password || payload.password.length < 12) {
            showNotice('warn', 'Password must be at least 12 chars with upper/lower/number/special (example: Fjord!Cloud#29).');
            return;
          }

          const res = await api('/register', payload);
          clearNotice();
          show(res);
          backAfterRegisterBtn.classList.remove('hidden');
          completeRegisterBtn.classList.add('hidden');
          cancelRegisterBtn.classList.add('hidden');
        } catch (e) {
          const msg = parseErrorMessage(e);
          if (msg.includes('password')) {
            showNotice('warn', 'Password rejected. Use min 12 chars with upper case + lower case + number + special character. Example: Fjord!Cloud#29');
          } else if (msg.includes('email is already registered')) {
            showNotice('warn', 'That email is already registered. Use LOGIN instead.');
          } else if (msg.includes('birthDateIso')) {
            showNotice('warn', 'Birth date must be in format YYYY-MM-DD (example: 1990-01-01).');
          } else {
            showNotice('err', msg);
          }
          show(String(e));
        }
      }

      async function loginWallet() {
        try {
          const payload = {
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPassword').value,
          };
          if (!isValidEmail(payload.email)) {
            showNotice('warn', 'Email format is invalid (example: name@example.com).');
            return;
          }
          if (!payload.password || !payload.password.trim()) {
            showNotice('warn', 'Password is required (example: Fjord!Cloud#29).');
            return;
          }

          const res = await api('/login', payload);
          loginFailCount = 0;
          clearNotice();
          setCurrentWallet(res);
          show(res);
          setPage('wallet');
        } catch (e) {
          loginFailCount += 1;
          const msg = parseErrorMessage(e);
          showNotice('warn', msg || 'Login failed. Progressive delay may apply.');
          if (loginFailCount === 1) {
            showNotice('warn', 'Login failed. ' + msg + ' Password policy: min 12 chars with upper case + lower case + number + special character. Progressive delay is active after repeated failures.');
          }
          show(String(e));
        } finally {
          clearLoginFields();
        }
      }

      async function changePassword() {
        try {
          await touchSession(true);
          const currentPassword = document.getElementById('currentPassword').value;
          const newPassword = document.getElementById('newPassword').value;
          const confirmNewPassword = document.getElementById('confirmNewPassword').value;

          if (!currentPassword || !currentPassword.trim()) {
            showNotice('warn', 'Current password is required (example: your current login password).');
            return;
          }
          if (!newPassword || newPassword.length < 12) {
            showNotice('warn', 'New password must be at least 12 chars with upper/lower/number/special (example: Fjord!Cloud#29).');
            return;
          }
          if (newPassword !== confirmNewPassword) {
            showNotice('warn', 'New password and confirmation do not match (example: both fields exactly Fjord!Cloud#29).');
            return;
          }

          openPasswordConfirmModal({ currentPassword, newPassword });
        } catch (e) {
          const msg = parseErrorMessage(e);
          if (msg.includes('password')) {
            showNotice('warn', 'Password change failed. Use min 12 chars with upper case + lower case + number + special character. Example: Fjord!Cloud#29');
          } else {
            showNotice('warn', msg);
          }
          show(String(e));
        }
      }

      async function requestEmailVerification() {
        try {
          await touchSession(true);
          const res = await api('/settings/request-email-verification', {});
          const token = res?.emailDelivery?.verificationToken;
          if (token) {
            const tokenInput = document.getElementById('emailVerificationToken');
            if (tokenInput) tokenInput.value = token;
          }
          showNotice('info', 'Verification token issued. Check simulated email payload in debug output or use the prefilled token.', 7000);
          show(res);
        } catch (e) {
          const msg = parseErrorMessage(e);
          showNotice('warn', msg);
          show(String(e));
        }
      }

      async function confirmEmailVerification() {
        try {
          await touchSession(true);
          const token = String(document.getElementById('emailVerificationToken').value || '').trim();
          if (!token) {
            showNotice('warn', 'Verification token is required (UUID format).');
            return;
          }
          const res = await api('/settings/verify-email', { verificationToken: token });
          sessionEmailVerified = Boolean(res?.emailVerified);
          renderIdentityFields();
          showSuccessModal('Email verified', 'Recovery email is now verified.');
          show(res);
        } catch (e) {
          const msg = parseErrorMessage(e);
          showNotice('warn', msg);
          show(String(e));
        }
      }

      function saveRecipientProfile() {
        touchSession(true);

        const now = Date.now();
        const cooldownMs = 5 * 1000;
        if (now - lastRecipientSaveAt < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - (now - lastRecipientSaveAt)) / 1000);
          showNotice('warn', 'Save/Update cooldown active: wait ' + waitSec + 's.', waitSec * 1000);
          return;
        }

        const uuid = document.getElementById('toWalletId').value.trim();
        const nickname = document.getElementById('recipientNickname').value;
        const email = document.getElementById('recipientEmail').value;
        if (!uuid) {
          showNotice('warn', 'Recipient UUID is required before saving (example: 123e4567-e89b-12d3-a456-426614174000).');
          show('Enter recipient UUID first (or use lookup).');
          return;
        }
        if (!isValidUuid(uuid)) {
          showNotice('warn', 'Recipient UUID format is invalid (example: 123e4567-e89b-12d3-a456-426614174000).');
          return;
        }
        if (email && !isValidEmail(email)) {
          showNotice('warn', 'Recipient email format is invalid (example: friend@example.com).');
          return;
        }

        const before = contactByUuid(uuid);

        upsertContact(uuid, nickname, email);
        lastRecipientSaveAt = now;
        if (saveRecipientBtn) {
          saveRecipientBtn.disabled = true;
          let left = Math.ceil(cooldownMs / 1000);
          saveRecipientBtn.textContent = 'Save/Update cooldown (' + left + 's)';
          if (saveRecipientCooldownTimer) clearInterval(saveRecipientCooldownTimer);
          saveRecipientCooldownTimer = setInterval(() => {
            left -= 1;
            if (!saveRecipientBtn) return;
            if (left > 0) {
              saveRecipientBtn.textContent = 'Save/Update cooldown (' + left + 's)';
            } else {
              clearInterval(saveRecipientCooldownTimer);
              saveRecipientCooldownTimer = null;
              saveRecipientBtn.disabled = false;
              saveRecipientBtn.textContent = 'Save/Update recipient profile';
            }
          }, 1000);
        }
        renderContacts();
        markRecipientDraftSaved();

        const after = contactByUuid(uuid) || null;
        const diff = {
          uuid,
          before: {
            nickname: before?.nickname || '',
            email: before?.email || '',
            exists: Boolean(before),
          },
          after: {
            nickname: after?.nickname || '',
            email: after?.email || '',
            exists: Boolean(after),
          },
        };
        addRecipientSummaryEvent('Save/Update', diff);

        showNotice('info', 'Recipient profile saved. Save/Update cooldown is 5s.');
        show({ ok: true, message: 'Recipient profile saved/updated locally.', diff });
      }



      async function transfer() {
        try {
          await touchSession(true);
          const fromWalletId = sessionWallet;
          const toWalletId = document.getElementById('toWalletId').value;
          const nickname = document.getElementById('recipientNickname').value;
          const recipientEmail = document.getElementById('recipientEmail').value;
          const transferMessage = document.getElementById('transferMessage').value.trim();
          const amountFSC = parseAmountFsc(document.getElementById('amountFSC').value);
          if (!toWalletId || !toWalletId.trim()) {
            showErrorModal('Receiver UUID is required (example: 123e4567-e89b-12d3-a456-426614174000). Transfer not sent.');
            return;
          }
          if (!isValidUuid(toWalletId)) {
            showErrorModal('Receiver UUID format is invalid (example: 123e4567-e89b-12d3-a456-426614174000). Transfer not sent.');
            return;
          }
          if (recipientEmail && !isValidEmail(recipientEmail)) {
            showErrorModal('Recipient email format is invalid (example: friend@example.com). Transfer not sent.');
            return;
          }
          if (transferMessage.length > 120) {
            showErrorModal('Message is too long (max 120 chars). Example: "Thanks for helping!" Transfer not sent.');
            return;
          }
          if (!Number.isFinite(amountFSC) || amountFSC <= 0) {
            showErrorModal('Use numbers with comma or period in amount field (e.g. 0,1 or 0.1). Transfer not sent.');
            return;
          }
          if (amountFSC < 0.000000000001) {
            showErrorModal('Minimum transfer is 0.000000000001 FSC (1 pico). Amount entered is below the smallest unit. Transfer not sent.');
            return;
          }

          if (!fromWalletId) {
            throw new Error('Not logged in.');
          }

          if (fromWalletId === toWalletId) {
            throw new Error('Receiver UUID must be different from your own UUID.');
          }

          openTransferModal({ fromWalletId, toWalletId, amountFSC, transferMessage, nickname, recipientEmail });
        } catch (e) {
          const msg = parseErrorMessage(e);
          const m = msg.toLowerCase();
          if (m.includes('minimum transfer') || m.includes('amount field') || m.includes('insufficient balance')) {
            showErrorModal(msg + ' Transfer not sent.');
          } else {
            showNotice('warn', msg);
          }
          show(String(e));
        }
      }

      // remint is automatic in simulation mode

      async function logout() {
        try { await api('/logout', {}); } catch (_) {}
        successModalLogoutPending = false;
        closeTransferModal();
        closeErrorModal();
        closeSuccessModal();
        closePasswordConfirmModal();
        logoutConfirmModalEl.classList.add('hidden');
        unsavedRecipientModalEl.classList.add('hidden');
        sessionExpiredModalEl.classList.add('hidden');
        pendingRecipientNavigation = null;
        pendingTransfer = null;
        pendingPasswordChange = null;
        clearNotice();
        sessionWallet = null;
        sessionEmail = null;
        sessionEmailVerified = false;
        sessionExpiresAtMs = null;
        sessionExpiredHandled = false;
        renderSessionTimer();
        uuidVisible = false;
        emailVisible = false;
        renderIdentityFields();
        clearLoginFields();

        currentBalanceEl.textContent = '-';
        currentStatusEl.textContent = '-';
        document.getElementById('toWalletId').value = '';
        document.getElementById('recipientLookup').value = '';
        document.getElementById('recipientMatches').textContent = '';
        document.getElementById('recipientNickname').value = '';
        document.getElementById('recipientEmail').value = '';
        document.getElementById('transferMessage').value = '';
        markRecipientDraftSaved();
        renderContacts();
        renderTransferHistory([]);
        hideRevertSummary();
        lastRecipientSaveAt = 0;
        if (saveRecipientCooldownTimer) { clearInterval(saveRecipientCooldownTimer); saveRecipientCooldownTimer = null; }
        if (saveRecipientBtn) {
          saveRecipientBtn.disabled = false;
          saveRecipientBtn.textContent = 'Save/Update recipient profile';
        }
        setPage('main');
      }

      function clearEntryFields() {
        [
          'passportNumber','birthDateIso','issuingAuthority','publicPepper','email','password',
          'loginEmail','loginPassword','recipientLookup','toWalletId','recipientNickname','recipientEmail','amountFSC','transferMessage',
          'currentPassword','newPassword','confirmNewPassword','emailVerificationToken'
        ].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      }

      // Start screen
      clearEntryFields();
      renderIdentityFields();
      renderContacts();
      renderSessionTimer();
      setInterval(renderSessionTimer, 1000);
      document.addEventListener('click', (ev) => {
        const t = ev.target;
        if (t && typeof t.closest === 'function' && t.closest('button')) {
          touchSession(true);
        } else {
          touchSession(false);
        }
      });
      document.addEventListener('input', () => { touchSession(false); });
      document.addEventListener('keydown', (ev) => {
        touchSession(false);
        if (ev.key !== 'Enter') return;

        const tag = (ev.target && ev.target.tagName) ? String(ev.target.tagName).toLowerCase() : '';
        if (tag === 'textarea') return;

        if (!pages.register.classList.contains('hidden')) {
          ev.preventDefault();
          registerWallet();
          return;
        }
        if (!pages.login.classList.contains('hidden')) {
          ev.preventDefault();
          loginWallet();
        }
      });
      setPage('main');
    </script>
  </body>
</html>`);
});

app.get("/recipients", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FSC Full Past Recipients</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
      .item { border-bottom: 1px solid #eee; padding: .6rem 0; }
      code { background:#f6f8fa; padding:.1rem .35rem; border-radius:6px; }
      .muted { color:#666; }
      input { padding:.45rem; width: 100%; box-sizing: border-box; margin-bottom:.7rem; }
    </style>
  </head>
  <body>
    <h1>Full Past Recipients</h1>
    <p class="muted">Local recipient contacts for this wallet.</p>
    <input id="searchBox" placeholder="Search by nick, email, UUID" />
    <div id="list">Loading…</div>
    <script>
      const params = new URLSearchParams(location.search);
      const walletId = params.get('walletId');
      const listEl = document.getElementById('list');
      const searchBox = document.getElementById('searchBox');
      let contacts = [];

      function maskUuid(uuid) {
        if (!uuid || uuid.length < 8) return '-';
        return uuid.slice(0, 8) + '-****-****-****-' + uuid.slice(-4);
      }
      function maskEmail(email) {
        if (!email || !email.includes('@')) return '-';
        const [local, domain] = email.split('@');
        const keep = Math.min(2, local.length);
        return local.slice(0, keep) + '*'.repeat(Math.max(2, local.length - keep)) + '@' + domain;
      }
      function copyText(v) { navigator.clipboard?.writeText(v).catch(() => {}); }
      function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
      }

      function render() {
        const q = (searchBox.value || '').trim().toLowerCase();
        const filtered = contacts.filter((c) => {
          if (!q) return true;
          const hay = (String(c.nickname || '') + ' ' + String(c.email || '') + ' ' + String(c.uuid || '')).toLowerCase();
          return hay.includes(q);
        });

        if (!filtered.length) {
          listEl.textContent = 'No matching recipients.';
          return;
        }

        listEl.innerHTML = filtered.map((c) =>
          '<div class="item">'
          + '<strong>' + (c.nickname || 'Recipient') + '</strong>'
          + '<br/><span class="muted">mail: ' + (c.email ? maskEmail(c.email) : '-') + ' · uuid: ' + maskUuid(c.uuid || '') + '</span>'
          + '</div>'
        ).join('');
      }

      function run() {
        if (!walletId) {
          listEl.textContent = 'Missing walletId in URL.';
          return;
        }
        try {
          const raw = localStorage.getItem('fsc.contacts.' + walletId);
          const parsed = raw ? JSON.parse(raw) : [];
          contacts = Array.isArray(parsed) ? parsed : [];
          render();
        } catch (e) {
          listEl.textContent = String(e);
        }
      }

      searchBox.addEventListener('input', render);
      run();
    </script>
  </body>
</html>`);
});

app.get("/history", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FSC Full Transfer History</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
      .item { border-bottom: 1px solid #eee; padding: .6rem 0; }
      code { background:#f6f8fa; padding:.1rem .35rem; border-radius:6px; }
      .muted { color:#666; }
      .toolbar { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:.75rem; }
      input, select, button { padding:.45rem; }
    </style>
  </head>
  <body>
    <h1>Full Transfer History</h1>
    <p class="muted">Wallet-scoped history view.</p>
    <div class="toolbar">
      <label>Direction</label>
      <select id="directionFilter">
        <option value="ALL">ALL</option>
        <option value="IN">IN</option>
        <option value="OUT">OUT</option>
      </select>
      <label>Search</label>
      <input id="searchBox" placeholder="nick, email, UUID" />
    </div>
    <div id="list">Loading…</div>
    <script>
      const params = new URLSearchParams(location.search);
      const walletId = params.get('walletId');
      const listEl = document.getElementById('list');
      const directionFilter = document.getElementById('directionFilter');
      const searchBox = document.getElementById('searchBox');
      let txsAll = [];

      function maskUuid(uuid) {
        if (!uuid || uuid.length < 8) return '-';
        return uuid.slice(0, 8) + '-****-****-****-' + uuid.slice(-4);
      }
      function maskEmail(email) {
        if (!email || !email.includes('@')) return '-';
        const [local, domain] = email.split('@');
        const keep = Math.min(2, local.length);
        return local.slice(0, keep) + '*'.repeat(Math.max(2, local.length - keep)) + '@' + domain;
      }
      function formatPicoToFsc(picoStr) {
        try {
          const pico = BigInt(String(picoStr || '0'));
          const whole = pico / 1000000000000n;
          const fracRaw = (pico % 1000000000000n).toString().padStart(12, '0').replace(/0+$/, '');
          return fracRaw ? (whole.toString() + '.' + fracRaw) : whole.toString();
        } catch { return '0'; }
      }
      function contactsForWallet(id) {
        if (!id) return [];
        try {
          const raw = localStorage.getItem('fsc.contacts.' + id);
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      }
      function copyText(v) { navigator.clipboard?.writeText(v).catch(() => {}); }
      function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
      }

      function render() {
        const q = searchBox.value.trim().toLowerCase();
        const dir = directionFilter.value;

        const filtered = txsAll.filter((x) => {
          if (dir !== 'ALL' && x.direction !== dir) return false;
          if (!q) return true;
          const hay = (x.nick + ' ' + x.mail + ' ' + x.counterparty).toLowerCase();
          return hay.includes(q);
        });

        if (!filtered.length) {
          listEl.textContent = 'No matching transfers.';
          return;
        }

        listEl.innerHTML = filtered.map((x) => '<div class="item">'
          + '<strong>' + x.direction + '</strong> · ' + x.amountFSC + ' FSC'
          + '<br/><span class="muted">' + x.when + '</span>'
          + '<br/><span class="muted">nick: ' + x.nick + ' · mail: ' + x.mail + ' · uuid: ' + maskUuid(x.counterparty) + '</span>'
          + (x.message ? '<br/><span class="muted">msg: ' + esc(x.message) + '</span>' : '')
          + '</div>').join('');
      }

      async function run() {
        if (!walletId) {
          listEl.textContent = 'Missing walletId in URL.';
          return;
        }
        const contacts = contactsForWallet(walletId);
        const ledgerRes = await fetch('/ledger?limit=500&offset=0').then((r) => r.json());
        const ledger = Array.isArray(ledgerRes) ? ledgerRes : (ledgerRes.items || []);
        txsAll = ledger
          .filter((e) => e.type === 'TRANSFER' && (e.fromWalletId === walletId || e.toWalletId === walletId))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .map((e) => {
            const direction = e.fromWalletId === walletId ? 'OUT' : 'IN';
            const counterparty = direction === 'OUT' ? e.toWalletId : e.fromWalletId;
            const c = contacts.find((x) => x.uuid === counterparty);
            return {
              direction,
              counterparty: counterparty || '',
              amountFSC: formatPicoToFsc(e.amountPico || '0'),
              when: new Date(e.at).toLocaleString(),
              nick: c?.nickname || '-',
              mail: c?.email ? maskEmail(c.email) : '-',
              message: (e.metadata && e.metadata.message) ? String(e.metadata.message) : '',
            };
          });
        render();
      }

      directionFilter.addEventListener('change', render);
      searchBox.addEventListener('input', render);
      run().catch((e) => { listEl.textContent = String(e); });
    </script>
  </body>
</html>`);
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/recipient/:walletId", (req, res) => {
  try {
    const s = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "recipient_lookup", label: "recipient lookup", budgets: ENDPOINT_BUDGETS.recipientLookup, accountId: s.walletId, includeIp: true, includeDevice: true });
    const walletId = z.string().uuid().parse(req.params.walletId);
    const exists = Boolean(ledger.getWallet(walletId));
    res.json({ exists });
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/wallet/:walletId", (req, res) => {
  try {
    const session = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "wallet_read", label: "wallet read", budgets: ENDPOINT_BUDGETS.walletRead, accountId: session.walletId, includeIp: true, includeDevice: true });
    const walletId = z.string().uuid().parse(req.params.walletId);
    if (walletId !== session.walletId) throw new FSCError("forbidden");

    const wallet = ledger.getWallet(walletId);
    if (!wallet) throw new FSCError("wallet not found");

    res.json({
      walletId: wallet.id,
      status: wallet.status,
      email: emailByWalletId.get(wallet.id) ?? undefined,
      emailVerified: emailVerifiedByWalletId.get(wallet.id) ?? false,
      balanceFSC: picoToFsc(wallet.balancePico),
      balancePico: wallet.balancePico.toString(),
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/register", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);


    const body = z.object({
      passportNumber: z.string().min(3),
      birthDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDateIso must be YYYY-MM-DD"),
      issuingAuthority: z.string().min(2),
      publicPepper: z.string().min(8),
      email: z.string().email(),
      password: z.string().min(12),
    }).parse(req.body);

    const policyErr = validatePasswordPolicy(body.password);
    if (policyErr) throw new FSCError(policyErr);

    const emailDigest = hashEmail(body.email);
    checkActionLimitByDimensions({ req, scope: "register", label: "register", budgets: ENDPOINT_BUDGETS.register, accountId: emailDigest, includeIp: true, includeDevice: true });
    if (walletByEmailHash.has(emailDigest)) {
      throw new FSCError("email is already registered");
    }

    const verification = identityVerifier.verifyAndDerive(body);
    const coinMintId = verification.coinMintId;
    const wallet = ledger.registerVerifiedHuman({ coinMintId, email: body.email });

    walletByEmailHash.set(emailDigest, wallet.id);
    passwordHashByEmailHash.set(emailDigest, bcrypt.hashSync(body.password, 10));
    emailByWalletId.set(wallet.id, body.email);
    emailVerifiedByWalletId.set(wallet.id, false);
    const verifyToken = issueEmailVerificationToken(wallet.id);
    saveState();
    audit("register_success", { walletId: wallet.id, emailHash: emailDigest.slice(0, 12) });

    res.status(201).json({
      walletId: wallet.id,
      coinMintId,
      identityVerification: {
        verifier: verification.verifier,
        proofRef: verification.proofRef,
        verifiedAtIso: verification.verifiedAtIso,
      },
      balanceFSC: picoToFsc(wallet.balancePico),
      emailVerificationRequired: true,
      emailDelivery: {
        simulated: true,
        to: body.email,
        subject: "FairShareCoin wallet created — verify your email",
        message: "Wallet registered. Verify email using the token, then login with email + password.",
        verificationToken: verifyToken,
        verificationExpiresInSec: EMAIL_VERIFICATION_TTL_SEC,
      },
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/login", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);

    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const emailDigest = hashEmail(body.email);
    checkActionLimitByDimensions({ req, scope: "login", label: "login", budgets: ENDPOINT_BUDGETS.login, accountId: emailDigest, includeIp: true, includeDevice: true });
    const waitMs = getLoginDelayMs(emailDigest);
    if (waitMs > 0) {
      audit("login_blocked_delay", { emailHash: emailDigest.slice(0, 12), waitMs });
      throw new FSCError(`progressive delay active: wait ${Math.ceil(waitMs / 1000)}s before retry`);
    }

    const walletId = walletByEmailHash.get(emailDigest);
    const storedPasswordHash = passwordHashByEmailHash.get(emailDigest);

    if (!walletId || !storedPasswordHash) {
      const waitSec = recordLoginFailure(emailDigest);
      audit("login_failed", { emailHash: emailDigest.slice(0, 12), reason: "unknown_email", waitSec });
      throw new FSCError(`invalid email or password (next retry in ${waitSec}s)`);
    }

    if (!bcrypt.compareSync(body.password, storedPasswordHash)) {
      const waitSec = recordLoginFailure(emailDigest);
      audit("login_failed", { emailHash: emailDigest.slice(0, 12), reason: "bad_password", waitSec });
      throw new FSCError(`invalid email or password (next retry in ${waitSec}s)`);
    }

    const wallet = ledger.getWallet(walletId);
    if (!wallet) throw new FSCError("wallet not found");

    clearLoginFailure(emailDigest);
    const sid = randomUUID();
    sessions.set(sid, { walletId: wallet.id, email: body.email, expiresAt: Date.now() + SESSION_TTL_MS });
    res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(sid)}; ${getCookieOptions(Math.floor(SESSION_TTL_MS / 1000))}`);
    audit("login_success", { walletId: wallet.id, sid });

    res.json({
      walletId: wallet.id,
      status: wallet.status,
      email: body.email,
      emailVerified: emailVerifiedByWalletId.get(wallet.id) ?? false,
      balanceFSC: picoToFsc(wallet.balancePico),
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/session/ping", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const s = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "ping", label: "session ping", budgets: ENDPOINT_BUDGETS.ping, accountId: s.walletId, includeIp: true, includeDevice: true });
    res.json({ ok: true, expiresAt: s.expiresAt });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/settings/request-email-verification", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const session = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "settings_email_verify_request", label: "email verification request", maxHits: 10, windowMs: 60_000, accountId: session.walletId, includeIp: true, includeDevice: true });

    const token = issueEmailVerificationToken(session.walletId);
    saveState();
    audit("email_verification_requested", { walletId: session.walletId });

    res.json({
      ok: true,
      emailDelivery: {
        simulated: true,
        to: session.email,
        subject: "FairShareCoin email verification",
        message: "Use the verification token to confirm your email.",
        verificationToken: token,
        verificationExpiresInSec: EMAIL_VERIFICATION_TTL_SEC,
      },
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/settings/verify-email", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const session = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "settings_email_verify_confirm", label: "email verification confirm", maxHits: 20, windowMs: 60_000, accountId: session.walletId, includeIp: true, includeDevice: true });

    const body = z.object({
      verificationToken: z.string().uuid(),
    }).parse(req.body);

    const expected = emailVerificationTokenByWalletId.get(session.walletId);
    const expiresAt = emailVerificationTokenExpiryByWalletId.get(session.walletId) ?? 0;
    if (!expected || !expiresAt) {
      audit("email_verification_failed", { walletId: session.walletId, reason: "no_active_token" });
      throw new FSCError("no active verification token");
    }
    if (Date.now() > expiresAt) {
      audit("email_verification_failed", { walletId: session.walletId, reason: "token_expired" });
      throw new FSCError("verification token expired");
    }
    if (body.verificationToken !== expected) {
      audit("email_verification_failed", { walletId: session.walletId, reason: "token_mismatch" });
      throw new FSCError("invalid verification token");
    }

    emailVerifiedByWalletId.set(session.walletId, true);
    emailVerificationTokenByWalletId.delete(session.walletId);
    emailVerificationTokenExpiryByWalletId.delete(session.walletId);
    saveState();
    audit("email_verified", { walletId: session.walletId });

    res.json({ ok: true, emailVerified: true });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/settings/change-password", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const session = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "settings_password", label: "change password", maxHits: 10, windowMs: 60_000, accountId: session.walletId, includeIp: true, includeDevice: true });

    const now = Date.now();
    const last = passwordChangeCooldownByWallet.get(session.walletId) ?? 0;
    const cooldownMs = 60 * 1000;
    if (now - last < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
      throw new FSCError(`password change cooldown active: wait ${waitSec}s`);
    }

    const body = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(12),
    }).parse(req.body);

    const emailDigest = hashEmail(session.email);
    const storedPasswordHash = passwordHashByEmailHash.get(emailDigest);
    if (!storedPasswordHash) throw new FSCError("account credentials not found");

    if (!bcrypt.compareSync(body.currentPassword, storedPasswordHash)) {
      throw new FSCError("current password is incorrect");
    }

    const policyErr = validatePasswordPolicy(body.newPassword);
    if (policyErr) throw new FSCError(policyErr);

    if (bcrypt.compareSync(body.newPassword, storedPasswordHash)) {
      throw new FSCError("new password must be different from current password");
    }

    passwordHashByEmailHash.set(emailDigest, bcrypt.hashSync(body.newPassword, 10));
    passwordChangeCooldownByWallet.set(session.walletId, now);

    // Revoke all active sessions for this wallet after password change.
    for (const [sid, s] of sessions.entries()) {
      if (s.walletId === session.walletId) sessions.delete(sid);
    }

    saveState();
    audit("password_changed", { walletId: session.walletId });

    res.json({
      ok: true,
      emailAlert: {
        simulated: true,
        to: session.email,
        subject: "FairShareCoin password changed",
        message: "Your password was changed. If this was not you, contact support immediately.",
      },
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/logout", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const active = getSession(req);
    checkActionLimitByDimensions({ req, scope: "logout", label: "logout", maxHits: 60, windowMs: 60_000, accountId: active?.walletId, includeIp: true, includeDevice: true });
  } catch (err) {
    return handleError(err, res);
  }
  const sid = parseCookies(req)[SESSION_COOKIE_NAME];
  if (sid) {
    const s = sessions.get(sid);
    sessions.delete(sid);
    audit("logout", { walletId: s?.walletId, sid });
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; ${getCookieOptions(0)}`);
  res.json({ ok: true });
});

app.post("/transfer", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const session = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "transfer", label: "transfer", budgets: ENDPOINT_BUDGETS.transfer, accountId: session.walletId, includeIp: true, includeDevice: true });
    const body = z.object({
      fromWalletId: z.string().uuid().optional(),
      toWalletId: z.string().uuid(),
      amountFSC: z.number().positive(),
      message: z.string().max(120).optional(),
    }).parse(req.body);

    const fromWalletId = session.walletId;
    if (fromWalletId === body.toWalletId) {
      throw new FSCError("receiver UUID must be different from sender UUID");
    }

    const amountPico = fscToPico(body.amountFSC);
    if (amountPico < 1n) {
      throw new FSCError("minimum transfer is 0.000000000001 FSC (1 pico)");
    }

    const now = Date.now();
    const last = transferCooldownByWallet.get(fromWalletId) ?? 0;
    const cooldownMs = 2 * 60 * 1000;
    if (now - last < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
      throw new FSCError(`transfer cooldown active: wait ${waitSec}s`);
    }

    const transferId = ledger.send(fromWalletId, body.toWalletId, amountPico, new Date(), body.message?.trim());
    transferCooldownByWallet.set(fromWalletId, now);
    saveState();
    audit("transfer_success", { transferId, fromWalletId, toWalletId: body.toWalletId, amountPico: amountPico.toString() });
    res.json({ ok: true, transferId });
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/cycle/annual-remint", (req, res) => {
  try {
    requireSameOrigin(req);
    requireCsrfToken(req);
    const s = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "cycle_remint", label: "annual remint", maxHits: 10, windowMs: 60_000, accountId: s.walletId, includeIp: true, includeDevice: true });
    const body = z.object({ monthDay: z.string().regex(/^\d{2}-\d{2}$/) }).parse(req.body);
    const updated = ledger.applyAnnualBurnRemint(body.monthDay);
    if (updated > 0) saveState();
    res.json({ updated });
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/wallets", (req, res) => {
  try {
    const s = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "wallets_read", label: "wallets read", maxHits: 30, windowMs: 60_000, accountId: s.walletId, includeIp: true, includeDevice: true });
    const wallet = ledger.getWallet(s.walletId);
    if (!wallet) throw new FSCError("wallet not found");
    res.json([{
      ...wallet,
      balanceFSC: picoToFsc(wallet.balancePico),
      balancePico: wallet.balancePico.toString(),
    }]);
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/ledger", (req, res) => {
  try {
    const s = requireSession(req);
    checkActionLimitByDimensions({ req, scope: "ledger_read", label: "ledger read", budgets: ENDPOINT_BUDGETS.ledgerRead, accountId: s.walletId, includeIp: true, includeDevice: true });

    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
      type: z.enum(["TRANSFER", "ISSUE", "FREEZE", "REACTIVATE", "ANNUAL_BURN_REMINT"]).optional(),
    }).parse(req.query);

    const limit = q.limit ?? 500;
    const offset = q.offset ?? 0;

    const all = ledger.listEntries();
    const filtered = q.type ? all.filter((e) => e.type === q.type) : all;
    const slice = filtered.slice(offset, offset + limit);

    res.json({
      total: filtered.length,
      limit,
      offset,
      items: slice.map((e) => ({ ...e, amountPico: e.amountPico?.toString() })),
    });
  } catch (err) {
    handleError(err, res);
  }
});

app.listen(port, () => {
  console.log(`FSC foundation API listening on http://localhost:${port}`);
  console.log("Simulation remint enabled: every 12 hours per wallet.");
});

setInterval(() => {
  const updated = ledger.applySimulationRemintIfDue(SIM_REMINT_INTERVAL_MS, new Date());
  if (updated > 0) {
    saveState();
    console.log(`[sim-remint] reminted ${updated} wallet(s)`);
  }
}, SIM_REMINT_CHECK_MS);

// password hashing handled by bcryptjs

function handleError(err: unknown, res: express.Response) {
  if (err instanceof FSCError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: err.issues });
  }
  console.error(err);
  return res.status(500).json({ error: "internal error" });
}
