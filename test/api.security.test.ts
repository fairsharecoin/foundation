import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";

const serverEntry = path.resolve(process.cwd(), "dist/src/api/server.js");

async function waitForHealthy(baseUrl: string, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("server did not become healthy in time");
}

function parseSetCookieCookies(setCookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!setCookieHeader) return out;
  for (const row of setCookieHeader.split(/,\s*(?=[^;]+=)/)) {
    const first = row.split(";")[0] || "";
    const i = first.indexOf("=");
    if (i > 0) out[first.slice(0, i)] = decodeURIComponent(first.slice(i + 1));
  }
  return out;
}

type CookieJar = Record<string, string>;

function jarToCookie(jar: CookieJar): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
}

function mergeSetCookie(jar: CookieJar, setCookie: string | null): CookieJar {
  return { ...jar, ...parseSetCookieCookies(setCookie) };
}

async function createClient(baseUrl: string): Promise<{ jar: CookieJar; request: (path: string, init?: RequestInit) => Promise<Response>; csrf: () => string }> {
  let jar: CookieJar = {};
  const page = await fetch(`${baseUrl}/`);
  jar = mergeSetCookie(jar, page.headers.get("set-cookie"));

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers || {});
    headers.set("cookie", jarToCookie(jar));
    const method = String(init?.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && jar.fsc_csrf && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", jar.fsc_csrf);
    }
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    jar = mergeSetCookie(jar, res.headers.get("set-cookie"));
    return res;
  };

  return {
    get jar() { return jar; },
    request,
    csrf: () => jar.fsc_csrf,
  } as any;
}

async function requestWithJar(baseUrl: string, jar: CookieJar, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (Object.keys(jar).length > 0) headers.set("cookie", jarToCookie(jar));
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function withServer(
  fn: (baseUrl: string, logs: string[]) => Promise<void>,
  extraEnv?: Record<string, string>,
): Promise<void> {
  const cwd = mkdtempSync(path.join(tmpdir(), "fsc-api-test-"));
  const port = 4300 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;

  const cp: ChildProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", ...(extraEnv || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  const logs: string[] = [];
  let stdoutBuf = "";
  cp.stdout?.on("data", (d) => {
    stdoutBuf += String(d);
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop() ?? "";
    logs.push(...lines.filter(Boolean));
  });
  cp.stderr?.on("data", (d) => { stderr += String(d); });

  try {
    await waitForHealthy(baseUrl);
    await fn(baseUrl, logs);
  } finally {
    cp.kill("SIGTERM");
    if (stderr.trim()) {
      // kept for local debugging only; not failing tests.
    }
  }
}

function parseAuditEvents(logs: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of logs) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // ignore non-json lines
    }
  }
  return out;
}

test("baseline security headers are present", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});

test("rejects oversized JSON request body", async () => {
  await withServer(async (baseUrl) => {
    const big = "x".repeat(40 * 1024);
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passportNumber: big,
        birthDateIso: "1990-01-01",
        issuingAuthority: "SE",
        publicPepper: "publicpepper123",
        email: "oversized@example.com",
        password: "StrongPass!123",
      }),
    });
    assert.equal(res.status, 413);
  });
});

test("register rejects missing CSRF token", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passportNumber: "A1234567",
        birthDateIso: "1990-01-01",
        issuingAuthority: "SE",
        publicPepper: "publicpepper123",
        email: "csrf-missing@example.com",
        password: "StrongPass!123",
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /CSRF/i);
  });
});

test("register accepts valid CSRF token from cookie", async () => {
  await withServer(async (baseUrl) => {
    const client = await createClient(baseUrl);
    const csrf = client.csrf();
    assert.ok(csrf, "missing csrf cookie");

    const res = await client.request(`/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passportNumber: "B1234567",
        birthDateIso: "1991-01-01",
        issuingAuthority: "SE",
        publicPepper: "publicpepper123",
        email: "csrf-ok@example.com",
        password: "StrongPass!123",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.walletId);
    assert.equal(body.identityVerification?.verifier, "mock");
    assert.match(String(body.identityVerification?.proofRef || ""), /^mock:/);
  });
});

test("CSRF matrix: all mutating endpoints reject missing CSRF header", async () => {
  await withServer(async (baseUrl) => {
    const actor = await registerAndLogin(baseUrl, "csrf-matrix@example.com");

    const publicCases: Array<{ path: string; body: unknown }> = [
      {
        path: "/register",
        body: {
          passportNumber: "M1234567",
          birthDateIso: "1990-01-01",
          issuingAuthority: "SE",
          publicPepper: "publicpepper123",
          email: "csrf-matrix-register@example.com",
          password: "StrongPass!123",
        },
      },
      { path: "/login", body: { email: "csrf-matrix@example.com", password: "StrongPass!123" } },
    ];

    for (const c of publicCases) {
      const r = await requestWithJar(baseUrl, actor.client.jar, c.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c.body),
      });
      assert.equal(r.status, 400, `${c.path} should reject missing CSRF header`);
      const b = await r.json();
      assert.match(String(b.error), /csrf/i);
    }

    const authedCases: Array<{ path: string; body: unknown }> = [
      { path: "/session/ping", body: {} },
      { path: "/settings/request-email-verification", body: {} },
      { path: "/settings/verify-email", body: { verificationToken: "00000000-0000-0000-0000-000000000000" } },
      { path: "/settings/change-password", body: { currentPassword: "StrongPass!123", newPassword: "StrongPass!456" } },
      { path: "/logout", body: {} },
      { path: "/transfer", body: { toWalletId: actor.walletId, amountFSC: 0.000001 } },
      { path: "/cycle/annual-remint", body: { monthDay: "01-01" } },
    ];

    for (const c of authedCases) {
      const r = await requestWithJar(baseUrl, actor.client.jar, c.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c.body),
      });
      assert.equal(r.status, 400, `${c.path} should reject missing CSRF header`);
      const b = await r.json();
      assert.match(String(b.error), /csrf/i);
    }
  });
});

test("same-origin policy blocks cross-origin POST even with valid CSRF token", async () => {
  await withServer(async (baseUrl) => {
    const { client } = await registerAndLogin(baseUrl, "csrf-origin@example.com");

    const res = await requestWithJar(baseUrl, client.jar, "/session/ping", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": client.csrf(),
        origin: "https://evil.example",
      },
      body: "{}",
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /origin policy/i);
  });
});

test("synthetic CSRF rejects trigger security_alert baseline", async () => {
  await withServer(async (baseUrl, logs) => {
    const client = await createClient(baseUrl);

    for (let i = 0; i < 8; i++) {
      const res = await requestWithJar(baseUrl, client.jar, "/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passportNumber: `X${i}123456`,
          birthDateIso: "1990-01-01",
          issuingAuthority: "SE",
          publicPepper: "publicpepper123",
          email: `csrf-alert-${i}@example.com`,
          password: "StrongPass!123",
        }),
      });
      assert.equal(res.status, 400);
    }

    await new Promise((r) => setTimeout(r, 80));
    const events = parseAuditEvents(logs);
    const alert = events.find((e) => e.event === "security_alert" && e.signal === "csrf_rejected_burst");
    assert.ok(alert, "expected csrf_rejected_burst security_alert event");
  });
});

test("synthetic repeated bad verification token triggers security_alert baseline", async () => {
  await withServer(async (baseUrl, logs) => {
    const actor = await registerAndLogin(baseUrl, "verify-alert@example.com");

    for (let i = 0; i < 5; i++) {
      const res = await actor.client.request("/settings/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationToken: "00000000-0000-0000-0000-000000000000" }),
      });
      assert.equal(res.status, 400);
    }

    await new Promise((r) => setTimeout(r, 80));
    const events = parseAuditEvents(logs);
    const alert = events.find((e) => e.event === "security_alert" && e.signal === "email_verification_failed_burst");
    assert.ok(alert, "expected email_verification_failed_burst security_alert event");
  });
});

async function registerAndLogin(baseUrl: string, email: string) {
  const client = await createClient(baseUrl);
  const registerRes = await client.request("/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      passportNumber: "P" + Math.floor(Math.random() * 1_000_000),
      birthDateIso: "1990-01-01",
      issuingAuthority: "SE",
      publicPepper: "publicpepper123",
      email,
      password: "StrongPass!123",
    }),
  });
  assert.equal(registerRes.status, 201);

  const loginRes = await client.request("/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "StrongPass!123" }),
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await loginRes.json();
  return { client, walletId: String(loginBody.walletId) };
}

test("progressive login delay blocks immediate retry after failed login", async () => {
  await withServer(async (baseUrl, logs) => {
    const email = "delay@example.com";
    await registerAndLogin(baseUrl, email);

    const badClient = await createClient(baseUrl);
    const bad = await badClient.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "WrongPass!999" }),
    });
    assert.equal(bad.status, 400);

    const immediateRetry = await badClient.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "StrongPass!123" }),
    });
    assert.equal(immediateRetry.status, 400);
    const body = await immediateRetry.json();
    assert.match(String(body.error), /progressive delay active/i);

    await new Promise((r) => setTimeout(r, 80));
    const events = parseAuditEvents(logs).map((e) => String(e.event || ""));
    const failedIdx = events.lastIndexOf("login_failed");
    const blockedIdx = events.lastIndexOf("login_blocked_delay");
    assert.ok(failedIdx >= 0, "expected login_failed audit event");
    assert.ok(blockedIdx > failedIdx, "expected login_blocked_delay after login_failed");
  });
});

test("password change invalidates existing sessions", async () => {
  await withServer(async (baseUrl) => {
    const acc = await registerAndLogin(baseUrl, "pw-invalidate@example.com");

    const pwRes = await acc.client.request("/settings/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "StrongPass!123", newPassword: "StrongPass!456" }),
    });
    assert.equal(pwRes.status, 200);

    const oldSessionWalletRes = await acc.client.request(`/wallet/${encodeURIComponent(acc.walletId)}`);
    assert.equal(oldSessionWalletRes.status, 400);
    const oldSessionErr = await oldSessionWalletRes.json();
    assert.match(String(oldSessionErr.error), /(session expired|not authenticated)/i);

    const relogClient = await createClient(baseUrl);
    const oldPasswordLogin = await relogClient.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "pw-invalidate@example.com", password: "StrongPass!123" }),
    });
    assert.equal(oldPasswordLogin.status, 400);

    await new Promise((r) => setTimeout(r, 1100));
    const newPasswordLogin = await relogClient.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "pw-invalidate@example.com", password: "StrongPass!456" }),
    });
    assert.equal(newPasswordLogin.status, 200);
  });
});

test("session timeout expires idle sessions", async () => {
  await withServer(async (baseUrl) => {
    const acc = await registerAndLogin(baseUrl, "ttl@example.com");
    await new Promise((r) => setTimeout(r, 2200));

    const pingRes = await acc.client.request("/session/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(pingRes.status, 400);
    const body = await pingRes.json();
    assert.match(String(body.error), /session expired/i);
  }, { FSC_SESSION_TTL_SEC: "1" });
});

test("forbidden wallet access is blocked", async () => {
  await withServer(async (baseUrl) => {
    const a = await registerAndLogin(baseUrl, "a@example.com");
    const b = await registerAndLogin(baseUrl, "b@example.com");

    const res = await a.client.request(`/wallet/${encodeURIComponent(b.walletId)}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(String(body.error), /forbidden/i);
  });
});

test("transfer cooldown is enforced", async () => {
  await withServer(async (baseUrl) => {
    const sender = await registerAndLogin(baseUrl, "sender@example.com");
    const receiver = await registerAndLogin(baseUrl, "receiver@example.com");

    const one = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
    });
    assert.equal(one.status, 200);

    const two = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
    });
    assert.equal(two.status, 400);
    const body = await two.json();
    assert.match(String(body.error), /cooldown/i);
  });
});

test("transfer cooldown allows retry after configured cooldown window", async () => {
  await withServer(async (baseUrl) => {
    const sender = await registerAndLogin(baseUrl, "sender-cooldown-window@example.com");
    const receiver = await registerAndLogin(baseUrl, "receiver-cooldown-window@example.com");

    const one = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
    });
    assert.equal(one.status, 200);

    const immediate = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
    });
    assert.equal(immediate.status, 400);

    await new Promise((r) => setTimeout(r, 1200));
    const afterWait = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
    });
    assert.equal(afterWait.status, 200);
  }, { FSC_TRANSFER_COOLDOWN_SEC: "1" });
});

test("transfer endpoint account rate limit is enforced under burst", async () => {
  await withServer(async (baseUrl) => {
    const sender = await registerAndLogin(baseUrl, "sender-rate@example.com");
    const receiver = await registerAndLogin(baseUrl, "receiver-rate@example.com");

    let sawRateLimit = false;
    for (let i = 0; i < 30; i++) {
      const res = await sender.client.request("/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001 }),
      });
      if (res.status === 400) {
        const body = await res.json();
        if (/rate limit/i.test(String(body.error))) {
          sawRateLimit = true;
          break;
        }
      }
    }

    assert.equal(sawRateLimit, true);
  }, { FSC_TRANSFER_COOLDOWN_SEC: "0" });
});

test("invalid transfer amount is rejected", async () => {
  await withServer(async (baseUrl) => {
    const sender = await registerAndLogin(baseUrl, "sender2@example.com");
    const receiver = await registerAndLogin(baseUrl, "receiver2@example.com");

    const res = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: -1 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(String(body.error).length > 0);
  });
});

test("history page contains esc helper (regression for full-history crash)", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/history?walletId=test`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /function esc\(s\)/);
  });
});

test("email verification lifecycle: request and confirm token", async () => {
  await withServer(async (baseUrl) => {
    const acc = await registerAndLogin(baseUrl, "verify@example.com");

    const reqRes = await acc.client.request("/settings/request-email-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(reqRes.status, 200);
    const reqBody = await reqRes.json();
    const token = String(reqBody?.emailDelivery?.verificationToken || "");
    assert.match(token, /^[0-9a-f-]{36}$/i);

    const verifyRes = await acc.client.request("/settings/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verificationToken: token }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.emailVerified, true);

    const walletRes = await acc.client.request(`/wallet/${encodeURIComponent(acc.walletId)}`);
    assert.equal(walletRes.status, 200);
    const walletBody = await walletRes.json();
    assert.equal(walletBody.emailVerified, true);
  });
});

test("core happy path: login, transfer, history, password change, logout", async () => {
  await withServer(async (baseUrl) => {
    const sender = await registerAndLogin(baseUrl, "happy-sender@example.com");
    const receiver = await registerAndLogin(baseUrl, "happy-receiver@example.com");

    const transferRes = await sender.client.request("/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toWalletId: receiver.walletId, amountFSC: 0.000001, message: "hello" }),
    });
    assert.equal(transferRes.status, 200);

    const ledgerRes = await sender.client.request("/ledger?limit=10&offset=0");
    assert.equal(ledgerRes.status, 200);
    const ledgerBody = await ledgerRes.json();
    assert.ok(Array.isArray(ledgerBody.items));
    assert.ok(ledgerBody.items.some((x: any) => x.type === "TRANSFER"));

    const pwRes = await sender.client.request("/settings/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "StrongPass!123", newPassword: "StrongPass!456" }),
    });
    assert.equal(pwRes.status, 200);

    const logoutRes = await sender.client.request("/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(logoutRes.status, 200);

    const postLogoutWalletRes = await sender.client.request(`/wallet/${encodeURIComponent(sender.walletId)}`);
    assert.equal(postLogoutWalletRes.status, 400);
    const err = await postLogoutWalletRes.json();
    assert.match(String(err.error), /not authenticated/i);
  });
});
