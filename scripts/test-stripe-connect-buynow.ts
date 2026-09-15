/**
 * E2E — STRIPE CONNECT BUY NOW (payment-first, solo locale).
 *
 * Flusso verificato:
 *   guest → POST /api/cliente/ordini
 *   → checkout_intento_crea (ordine_id NULL + riserva)
 *   → Checkout Session Stripe Connect mock
 *   → webhook checkout.session.completed
 *   → checkout_intento_conferma
 *   → ordine + conversione riserva
 *
 * Il mock Stripe è esclusivamente loopback. Il test usa PostgreSQL/Supabase
 * locale e avvia Next con process.execPath + next/dist/bin/next, shell:false.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createWriteStream, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(__dirname, "..");
const SUPABASE_LOCAL_URL = "http://127.0.0.1:54321";
const DB_CONTAINER = "supabase_db_localhub";
const DB_USER = "postgres";
const DB_NAME = "postgres";
const TEST_ENCRYPTION_KEY = "stripe-connect-buynow-local-key-0001";
const PLATFORM_SECRET = "sk_test_stripe_connect_buynow_local";
const PLATFORM_WEBHOOK_SECRET = "whsec_stripe_connect_buynow_local";
const NEXT_PORT = Number(process.env.STRIPE_CONNECT_BUYNOW_PORT ?? 3189);
const NEXT_BASE = `http://127.0.0.1:${NEXT_PORT}`;
const CONNECT_ACCOUNT = "acct_local_stripe_connect_buynow";

let passed = 0;
let failed = 0;
const failedNames: string[] = [];
let nextProcess: ChildProcess | null = null;
let guestCookie: string | null = null;
let preloadPath: string | null = null;
let nextLog: ReturnType<typeof createWriteStream> | null = null;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failedNames.push(name);
    console.log(`  ❌ ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}

function sqlLiteral(value: string): string {
  if (value.includes("$test$")) throw new Error("fixture SQL non sicura");
  return `$test$${value}$test$`;
}

function sqlUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`UUID fixture non valido: ${value}`);
  }
  return `'${value.toLowerCase()}'`;
}

function localPostgres(sql: string): string {
  const result = spawnSync(
    "docker",
    [
      "exec", "-i", DB_CONTAINER,
      "psql", "-U", DB_USER, "-h", "127.0.0.1", "-d", DB_NAME,
      "-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-q",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.error) throw new Error(`psql locale: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`psql locale exit=${result.status}: ${(result.stderr ?? result.stdout ?? "").trim()}`);
  }
  return result.stdout ?? "";
}

function pgRows(sql: string): string[][] {
  const output = localPostgres(`${sql.trim().replace(/;$/, "")};\n`);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

function pgSingle(sql: string, label: string): string[] {
  const rows = pgRows(sql);
  if (rows.length !== 1) throw new Error(`[ASSERT] ${label}: attese 1 riga, trovate ${rows.length}`);
  return rows[0];
}

function readLocalSupabaseEnv(): { url: string; anonKey: string; serviceRole: string } {
  const npxCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const output = execFileSync(process.execPath, [npxCli, "--no-install", "supabase", "status", "-o", "env"], {
    cwd: PROJECT,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim().replace(/^["']|["']$/g, ""),
    );
  }
  const url = values.get("API_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRole = values.get("SERVICE_ROLE_KEY");
  if (url !== SUPABASE_LOCAL_URL || !anonKey || !serviceRole) {
    throw new Error("Supabase locale inatteso o incompleto.");
  }
  return { url, anonKey, serviceRole };
}

function verifyLocalPostgres(): void {
  const [role, database, address] = pgSingle(
    "select current_user, current_database(), host(inet_server_addr())",
    "self-check PostgreSQL locale",
  );
  if (role !== DB_USER || database !== DB_NAME || address !== "127.0.0.1") {
    throw new Error(`PostgreSQL inatteso: role=${role} db=${database} host=${address}`);
  }
}

function createFixture(ts: number): { storeP: string; storeN: string; productP: string; productN: string } {
  const output = localPostgres(`
begin;
with row as (
  insert into public.negozi (nome, slug, attivo, is_demo, pacco_peso_grammi)
  values (${sqlLiteral(`StripeConnectP-${ts}`)}, ${sqlLiteral(`stripe-connect-p-${ts}`)}, true, true, 1500)
  returning id
) select 'storeP|' || id from row;
with row as (
  insert into public.negozi (nome, slug, attivo, is_demo)
  values (${sqlLiteral(`StripeConnectN-${ts}`)}, ${sqlLiteral(`stripe-connect-n-${ts}`)}, true, true)
  returning id
) select 'storeN|' || id from row;
with rows as (
  insert into public.negozio_metodi_pagamento (negozio_id, metodo, attivo, ordine_mostra)
  select id, 'carta', true, 0 from public.negozi where slug = ${sqlLiteral(`stripe-connect-p-${ts}`)}
  returning id
) select 'methodsP|' || count(*) from rows;
with row as (
  insert into public.prodotti (negozio_id, nome, slug, prezzo, quantita_disponibile, attivo, ha_varianti, peso_grammi)
  select id, ${sqlLiteral(`StripeConnectP-${ts}`)}, ${sqlLiteral(`stripe-connect-product-p-${ts}`)}, 25, 7, true, false, 1500
  from public.negozi where slug = ${sqlLiteral(`stripe-connect-p-${ts}`)}
  returning id
) select 'productP|' || id from row;
with row as (
  insert into public.prodotti (negozio_id, nome, slug, prezzo, quantita_disponibile, attivo, ha_varianti, peso_grammi)
  select id, ${sqlLiteral(`StripeConnectN-${ts}`)}, ${sqlLiteral(`stripe-connect-product-n-${ts}`)}, 20, 7, true, false, 1500
  from public.negozi where slug = ${sqlLiteral(`stripe-connect-n-${ts}`)}
  returning id
) select 'productN|' || id from row;
commit;
`);
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const separator = line.indexOf("|");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  const uuid = (key: string): string => {
    const value = values.get(key) ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error(`[SETUP] ${key} non restituito o non valido.`);
    }
    return value;
  };
  const bigint = (key: string): string => {
    const value = values.get(key) ?? "";
    if (!/^\d+$/.test(value)) throw new Error(`[SETUP] ${key} non restituito o non valido.`);
    return value;
  };
  if (Number(values.get("methodsP")) !== 1) throw new Error("[SETUP] metodo carta fixture non creato.");
  return {
    storeP: uuid("storeP"),
    storeN: uuid("storeN"),
    productP: bigint("productP"),
    productN: bigint("productN"),
  };
}

function cleanupFixture(storeIds: string[]): void {
  for (const storeId of storeIds) {
    localPostgres(`
begin;
delete from public.pagamenti_eventi where negozio_id = ${sqlUuid(storeId)};
delete from public.pagamenti_sessioni where negozio_id = ${sqlUuid(storeId)};
delete from public.ordini where negozio_id = ${sqlUuid(storeId)};
delete from public.prodotti where negozio_id = ${sqlUuid(storeId)};
delete from public.negozio_metodi_pagamento where negozio_id = ${sqlUuid(storeId)};
delete from public.negozio_pagamenti where negozio_id = ${sqlUuid(storeId)};
delete from public.negozi where id = ${sqlUuid(storeId)};
commit;
`);
  }
}

function createStripePreload(mockPort: number): string {
  const path = join(tmpdir(), `stripe-connect-buynow-${randomUUID()}.cjs`);
  const source = `
const Module = require('node:module');
const http = require('node:http');
const https = require('node:https');
const redirect = (options, args) => {
  const parsed = typeof options === 'string' ? new URL(options) : (options && options.url ? new URL(options.url) : options);
  const hostname = parsed && (parsed.hostname || parsed.host);
  const path = parsed && (parsed.path || ((parsed.pathname || '') + (parsed.search || '')));
  console.log('[STRIPE PRELOAD] request host=' + String(hostname || '') + ' path=' + String(path || ''));
  if (hostname === 'api.stripe.com') {
    const redirected = typeof options === 'string'
      ? {
          hostname: '127.0.0.1',
          port: ${mockPort},
          path: parsed.pathname + parsed.search,
          method: 'GET',
          agent: false,
          protocol: 'http:',
          headers: {},
        }
      : {
          hostname: '127.0.0.1',
          port: ${mockPort},
          path: options.path || parsed.path || '/',
          method: options.method || 'GET',
          agent: false,
          protocol: 'http:',
          headers: { ...(options.headers || {}), host: '127.0.0.1:${mockPort}' },
        };
    console.log('[STRIPE PRELOAD] redirected host=127.0.0.1 port=${mockPort} path=' + String(redirected.path || ''));
    const request = http.request(redirected, ...args);
    // Stripe's NodeHttpClient selected the HTTPS path and waits for
    // secureConnect; the loopback transport is plain HTTP, so bridge the
    // equivalent local connect event without changing application code.
    request.once('socket', (socket) => {
      const signalSecureConnect = () => socket.emit('secureConnect');
      if (socket.connecting) socket.once('connect', signalSecureConnect);
      else process.nextTick(signalSecureConnect);
    });
    request.on('response', (response) => console.log('[STRIPE PRELOAD] mock response status=' + String(response.statusCode || '') + ' content-type=' + String(response.headers['content-type'] || '')));
    request.on('error', (error) => console.log('[STRIPE PRELOAD] mock error code=' + String(error && error.code || '') + ' message=' + String(error && error.message || '')));
    return request;
  }
  return null;
};  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;
  const patchedRequest = function(options, ...args) {
    const redirectedRequest = redirect(options, args);
    if (redirectedRequest) return redirectedRequest;
    return originalHttpsRequest.call(this, options, ...args);
  };
  const patchedGet = function(options, ...args) {
    const redirectedRequest = redirect(options, args);
    if (redirectedRequest) return redirectedRequest;
    return originalHttpsGet.call(this, options, ...args);
  };
https.request = patchedRequest;
https.get = patchedGet;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (request === 'https' || request === 'node:https') {
    loaded.request = patchedRequest;
    loaded.get = patchedGet;
  }
  return loaded;
};
`;
  writeFileSync(path, source, "utf8");
  preloadPath = path;
  return path;
}

function startStripeMock(): Promise<{
  port: number;
  sessionId: string;
  paymentIntent: string;
  lastRequest: () => { headers: Record<string, string | string[] | undefined>; body: string } | null;
  close: () => Promise<void>;
}> {
  const sessionId = `cs_test_connect_buynow_${randomUUID()}`;
  const paymentIntent = `pi_test_connect_buynow_${randomUUID()}`;
  let last: { headers: Record<string, string | string[] | undefined>; body: string } | null = null;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      last = { headers: req.headers, body };
      console.log(`[STRIPE MOCK] request method=${req.method ?? ""} path=${req.url ?? ""} content-type=${req.headers["content-type"] ?? ""} body-length=${Buffer.byteLength(body, "utf8")}`);
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        const responseBody = JSON.stringify({
          id: sessionId,
          object: "checkout.session",
          url: `http://127.0.0.1/stripe-mock/checkout/${sessionId}`,
          status: "open",
          payment_status: "unpaid",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          client_reference_id: null,
          metadata: {},
        });
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(responseBody, "utf8")),
          connection: "close",
        });
        res.end(responseBody);
        console.log(`[STRIPE MOCK] response status=200 content-type=application/json length=${Buffer.byteLength(responseBody, "utf8")}`);
        return;
      }
      const responseBody = JSON.stringify({ error: "mock route not found" });
      res.writeHead(404, {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(Buffer.byteLength(responseBody, "utf8")),
        connection: "close",
      });
      res.end(responseBody);
      console.log(`[STRIPE MOCK] response status=404 content-type=application/json length=${Buffer.byteLength(responseBody, "utf8")}`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      console.log(`[STRIPE MOCK] listening host=127.0.0.1 port=${address.port}`);
      resolve({
        port: address.port,
        sessionId,
        paymentIntent,
        lastRequest: () => last,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function startNext(mockPort: number, anonKey: string, serviceRole: string): Promise<void> {
  const preload = createStripePreload(mockPort);
  nextLog = createWriteStream(join(tmpdir(), "stripe-connect-buynow-next-dev.log"), { flags: "w" });
  const nextEntry = join(PROJECT, "node_modules", "next", "dist", "bin", "next");
  nextProcess = spawn(process.execPath, [nextEntry, "dev", "-p", String(NEXT_PORT), "--webpack"], {
    cwd: PROJECT,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_LOCAL_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRole,
      PAYMENTS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      STRIPE_SECRET_KEY: PLATFORM_SECRET,
      STRIPE_WEBHOOK_SECRET: PLATFORM_WEBHOOK_SECRET,
      STRIPE_CONNECT_CLIENT_ID: "ca_test_stripe_connect_local",
      ORDINI_RATE_LIMIT_PER_MINUTE: "1000",
      ORDINI_RATE_LIMIT_PER_HOUR: "10000",
      RESEND_API_KEY: "",
      NODE_ENV: "development",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preload}`.trim(),
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextProcess.stdout?.pipe(nextLog);
  nextProcess.stderr?.pipe(nextLog);
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 180_000;
    const poll = async () => {
      if (!nextProcess) return reject(new Error("Next non avviato"));
      if (nextProcess.exitCode !== null) return reject(new Error("Next terminato prima della readiness probe"));
      try {
        const response = await fetch(`${NEXT_BASE}/api/cliente/ordini`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.8.8.8" },
          body: "{}",
        });
        if (response.status === 403 || response.status === 422) return resolve();
      } catch {}
      if (Date.now() >= deadline) return reject(new Error("Next non pronto entro 180 secondi"));
      setTimeout(() => void poll(), 1000);
    };
    void poll();
  });
}

function stopNext(): void {
  if (nextProcess) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(nextProcess.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        nextProcess.kill("SIGTERM");
      }
    } catch {}
    nextProcess = null;
  }
  nextLog?.end();
  nextLog = null;
  if (preloadPath) {
    rmSync(preloadPath, { force: true });
    preloadPath = null;
  }
}

async function activateGuest(): Promise<void> {
  const response = await fetch(`${NEXT_BASE}/api/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.8.8.8" },
    body: JSON.stringify({ intent: "activate" }),
  });
  if (!response.ok) throw new Error(`guest activation failed: HTTP ${response.status}`);
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  const cookieLine = cookies.find((cookie) => cookie.toLowerCase().startsWith("lh_guest="));
  guestCookie = cookieLine ? cookieLine.split(";")[0] : null;
  if (!guestCookie) throw new Error("cookie lh_guest assente");
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${NEXT_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.8.8.9",
      ...(guestCookie ? { cookie: guestCookie } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, json };
}

async function postStripeWebhook(rawBody: string): Promise<{ status: number; text: string }> {
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: PLATFORM_WEBHOOK_SECRET,
  });
  const response = await fetch(`${NEXT_BASE}/api/webhook/pagamenti/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: rawBody,
  });
  return { status: response.status, text: await response.text() };
}

function buyNowPayload(key: string, productId: string, paymentMethod = "carta") {
  return {
    idempotencyKey: key,
    prodottoId: productId,
    varianteId: null,
    quantita: 1,
    modalita: "spedizione",
    cliente: {
      nome: "Mario",
      cognome: "Stripe",
      email: "stripe-connect@localhub.test",
      telefono: "3331234567",
    },
    spedizione: {
      indirizzo: "Via Connect 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      carrier: "poste_italiane",
      servizio: "standard",
      metodoPagamento: paymentMethod,
    },
    note: null,
  };
}

async function main(): Promise<void> {
  const supabase = readLocalSupabaseEnv();
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabase.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabase.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRole;
  process.env.PAYMENTS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.STRIPE_SECRET_KEY = PLATFORM_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_WEBHOOK_SECRET;
  verifyLocalPostgres();

  const db: SupabaseClient = createClient(supabase.url, supabase.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ts = Date.now();
  let storeP: string | null = null;
  let storeN: string | null = null;
  let productP: string | null = null;
  let productN: string | null = null;
  let mock: Awaited<ReturnType<typeof startStripeMock>> | null = null;
  let checkoutId: string | null = null;
  let sessionPaymentId: string | null = null;
  let amount: number | null = null;
  let stockBefore = 0;
  let reservedBefore = 0;

  try {
    mock = await startStripeMock();
    await startNext(mock.port, supabase.anonKey, supabase.serviceRole);
    await activateGuest();

    const fixture = createFixture(ts);
    storeP = fixture.storeP;
    storeN = fixture.storeN;
    productP = fixture.productP;
    productN = fixture.productN;
    console.log(`[SETUP] fixture Stripe Connect locale: storeP=${storeP}, storeN=${storeN}, products=${productP}/${productN}`);

    const connected = await db.rpc("pagamenti_stripe_connect_crea", {
      p_negozio_id: storeP,
      p_account_id: CONNECT_ACCOUNT,
      p_account_name: "Stripe Connect Buy Now Mock",
      p_test_mode: true,
    });
    if (connected.error || (connected.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`fixture Stripe Connect non creata: ${connected.error?.message ?? JSON.stringify(connected.data)}`);
    }
    const state = await db.rpc("pagamenti_stripe_connect_stato_salva", {
      p_account_id: CONNECT_ACCOUNT,
      p_onboarding_status: "complete",
      p_payouts_enabled: true,
      p_charges_enabled: true,
    });
    if (state.error || (state.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`stato Stripe Connect fixture non salvato: ${state.error?.message ?? JSON.stringify(state.data)}`);
    }
    const [account, onboarding, payouts, charges] = pgSingle(
      `select account_id, onboarding_status, payouts_enabled, charges_enabled from public.negozio_pagamenti where negozio_id = ${sqlUuid(storeP)} and provider = 'stripe'`,
      "fixture Stripe Connect",
    );
    check("fixture Connect: account_id presente", account === CONNECT_ACCOUNT, account);
    check("fixture Connect: onboarding complete", onboarding === "complete", onboarding);
    check("fixture Connect: payouts_enabled", payouts === "t", payouts);
    check("fixture Connect: charges_enabled", charges === "t", charges);

    console.log("\n[T1] Buy Now carta su negozio senza Stripe Connect");
    {
      const result = await postJson("/api/cliente/ordini", buyNowPayload(`stripe-nonconf-${ts}`, productN!));
      check("1a. HTTP 422", result.status === 422, result.status);
      check("1b. codice CARTA_NON_DISPONIBILE", result.json?.error?.code === "CARTA_NON_DISPONIBILE", result.json?.error);
      const [count] = pgSingle(
        `select count(*) from public.pagamenti_sessioni where negozio_id = ${sqlUuid(storeN)} and created_at >= ${sqlLiteral(new Date(ts - 1000).toISOString())}::timestamptz`,
        "sessioni T1",
      );
      check("1c. nessuna sessione T1", Number(count) === 0, count);
    }

    console.log("\n[T2] Buy Now Stripe Connect → intento + Checkout Session (payment-first)");
    {
      const [stock, reserved] = pgSingle(
        `select quantita_disponibile, quantita_riservata from public.prodotti where id = ${productP}`,
        "stock T2 iniziale",
      );
      stockBefore = Number(stock);
      reservedBefore = Number(reserved);
      const key = `stripe-connect-${ts}`;
      const result = await postJson("/api/cliente/ordini", buyNowPayload(key, productP!));
      const session = pgSingle(
        `select id, provider, status, coalesce(ordine_id::text, ''), coalesce(payment_id, ''), amount::text from public.pagamenti_sessioni where checkout_key = ${sqlLiteral(key)} order by created_at desc limit 1`,
        "sessione Stripe T2",
      );
      checkoutId = result.json?.data?.checkoutId ? String(result.json.data.checkoutId) : null;
      sessionPaymentId = session[4] || null;
      amount = Number(session[5]);
      check("2a. HTTP 201 + checkoutId", result.status === 201 && Boolean(checkoutId), { status: result.status, error: result.json?.error });
      check("2b. redirect Stripe presente", typeof result.json?.data?.pagamento?.redirectUrl === "string" && result.json.data.pagamento.redirectUrl.startsWith("http://127.0.0.1/stripe-mock/"), result.json?.data?.pagamento);
      check("2c. sessione provider=stripe", session[1] === "stripe", session);
      check("2d. sessione status=created", session[2] === "created", session);
      check("2e. sessione ordine_id NULL", session[3] === "", session);
      check("2f. payment_id Checkout Session persistito", session[4] === mock!.sessionId, session);
      check("2g. gateway ha usato Stripe Connect", mock!.lastRequest()?.headers["stripe-account"] === CONNECT_ACCOUNT, mock!.lastRequest()?.headers["stripe-account"]);
      const requestParams = new URLSearchParams(mock!.lastRequest()?.body ?? "");
      check("2h. application fee commissione presente", requestParams.has("payment_intent_data[application_fee_amount]"), requestParams.has("payment_intent_data[application_fee_amount]"));
      const [premature] = pgSingle(
        `select count(*) from public.ordini where idempotency_key = ${sqlLiteral(checkoutId ?? "")}`,
        "ordine prematuro T2",
      );
      check("2i. nessun ordine prima del pagamento", Number(premature) === 0, premature);
      const [stockAfter, reservedAfter] = pgSingle(
        `select quantita_disponibile, quantita_riservata from public.prodotti where id = ${productP}`,
        "stock T2 finale",
      );
      check("2j. stock disponibile invariato", Number(stockAfter) === stockBefore, { before: stockBefore, after: stockAfter });
      check("2k. una riserva creata", Number(reservedAfter) === reservedBefore + 1, { before: reservedBefore, after: reservedAfter });
    }

    console.log("\n[T3] checkout.session.completed → checkout_intento_conferma → ordine");
    {
      check("3a. riferimenti T2 disponibili", Boolean(checkoutId && sessionPaymentId && amount !== null));
      if (!checkoutId || !sessionPaymentId || amount === null) throw new Error("[T3] riferimenti sessione mancanti");
      const eventId = `evt_stripe_connect_buynow_${ts}_${randomUUID()}`;
      const raw = JSON.stringify({
        id: eventId,
        object: "event",
        api_version: "2024-06-20",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        account: CONNECT_ACCOUNT,
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionPaymentId,
            client_reference_id: checkoutId,
            metadata: { ordine_id: checkoutId, negozio_id: storeP },
            status: "complete",
            payment_status: "paid",
            amount_total: Math.round(amount * 100),
            currency: "eur",
            payment_intent: mock.paymentIntent,
          },
        },
      });
      const first = await postStripeWebhook(raw);
      check("3b. webhook Stripe HTTP 200", first.status === 200, first);
      const orderRows = pgRows(
        `select id, metodo_pagamento, payment_provider, payment_status, stato from public.ordini where idempotency_key = ${sqlLiteral(checkoutId)} limit 1`,
      );
      const order = orderRows[0] ?? [];
      check("3c. checkout_intento_conferma crea ordine", orderRows.length === 1 && Boolean(order[0]), orderRows);
      check("3d. payment_provider=stripe", order[2] === "stripe", order);
      check("3e. metodo_pagamento=carta", order[1] === "carta", order);
      check("3f. payment_status=paid", order[3] === "paid", order);
      const sessionAfter = pgRows(
        `select id from public.pagamenti_sessioni where id = ${sqlUuid(checkoutId)} and provider = 'stripe' and status = 'paid' and ordine_id = ${sqlUuid(order[0] ?? "00000000-0000-4000-8000-000000000000")}`,
      );
      check("3g. sessione paid e ordine_id valorizzato", sessionAfter.length === 1, sessionAfter);
      const [stockAfter, reservedAfter] = pgSingle(
        `select quantita_disponibile, quantita_riservata from public.prodotti where id = ${productP}`,
        "stock T3",
      );
      check("3h. stock decrementato una volta", Number(stockAfter) === stockBefore - 1, { before: stockBefore, after: stockAfter });
      check("3i. riserva convertita in vendita", Number(reservedAfter) === reservedBefore, { before: reservedBefore, after: reservedAfter });
      const [foreignSessions] = pgSingle(
        `select count(*) from public.pagamenti_sessioni where negozio_id = ${sqlUuid(storeP)} and provider = 'klarna' and created_at >= ${sqlLiteral(new Date(ts - 1000).toISOString())}::timestamptz`,
        "sessioni altri provider",
      );
      check("3j. nessuna sessione Klarna", Number(foreignSessions) === 0, foreignSessions);

      const duplicate = await postStripeWebhook(raw);
      const [ordersAfterDuplicate] = pgSingle(
        `select count(*) from public.ordini where idempotency_key = ${sqlLiteral(checkoutId)}`,
        "ordine duplicato webhook",
      );
      check("3k. webhook duplicato idempotente", duplicate.status === 200 && duplicate.text.includes("Evento già processato") && Number(ordersAfterDuplicate) === 1, duplicate);
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`STRIPE CONNECT BUY-NOW: ${passed} PASS / ${failed} FAIL`);
    if (failed > 0) {
      console.log(`FALLITI: ${failedNames.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("TUTTI I TEST PASSATI ✓");
    }
  } finally {
    console.log("\n── CLEANUP ──");
    try {
      const ids = [storeP, storeN].filter((id): id is string => Boolean(id));
      if (ids.length > 0) cleanupFixture(ids);
      console.log("  Fixture PostgreSQL eliminate.");
    } catch (error) {
      console.error("  Cleanup fixture fallito:", error instanceof Error ? error.message : String(error));
    }
    stopNext();
    if (mock) await mock.close().catch(() => {});
  }
}

void main().catch((error) => {
  console.error("Errore E2E Stripe Connect:", error);
  process.exitCode = 1;
});
