/**
 * F2.6 TEST — E2E COMPLETO CARRELLO + CHECKOUT MULTI-NEGOZIO
 * (server dev REALE + Supabase REALE + HTTP Stripe MOCKATO come F1/F2.3).
 *
 * Copre l'intero arco: carrello → checkout (F2.4/F2.5) → ordini per negozio
 * (F2.1/F2.2) → sessioni Stripe separate (F2.3) → pending/paid (webhook
 * reale) → retry → scadenza e ripristino stock → regressione buy-now.
 *
 *   T1   carrello vuoto → 422, nessun ordine;
 *   T2   guest, 1 negozio multi-riga (legacy + VARIANTE), spedizione,
 *        bonifico → 201, snapshot, totale server-side, stock decrementato,
 *        cliente_user_id NULL;
 *   T3   guest, MULTI-NEGOZIO → 201, UN ordine per negozio, totali per
 *        negozio (spedizione una sola volta per ordine);
 *   T4   utente AUTENTICATO (sessione reale via cookie) → cliente_user_id
 *        valorizzato server-side;
 *   T5   varianti: prodotto ha_varianti senza varianteId → 422
 *        VARIANTE_OBBLIGATORIA; varianteId ok → riga accettata;
 *   T6   stock insufficiente su UN negozio → errore isolato, ordini degli
 *        altri negozi intatti (nessun ordine parziale);
 *   T7   IDEMPOTENZA: stessa checkoutKey → 200, stessi ordini, stock
 *        decrementato UNA sola volta;
 *   T8   DOPPIO CHECKOUT (chiavi diverse) → 201 ×2, 2 ordini distinti,
 *        stock decrementato per ciascuno (nessuna fusione impropria);
 *   T9   SESSIONI STRIPE SEPARATE (mock HTTP): UN ordine = UNA sessione,
 *        redirectUrl distinti, client_reference_id = ordineId, una sola
 *        sessione attiva per ordine, payment_provider='stripe',
 *        payment_status='pending';
 *   T10  RETRY pagamento → stessa sessione attiva (giaEsistente), nessuna
 *        nuova chiamata HTTP a Stripe;
 *   T11  WEBHOOK reale checkout.session.completed (firma verificata) →
 *        ordine paid, provider resta 'stripe', transaction valorizzata,
 *        sessione paid, evento processato, duplicato idempotente;
 *   T12  WEBHOOK reale checkout.session.expired → ordine cancellato
 *        (pagamento_scaduto), payment_status expired, STOCK RIPRISTINATO;
 *   T13  SCAdenza sweep (elaboraPagamentiScaduti, payment_expires_at nel
 *        passato) → ripristino stock;
 *   T14  stati ordini: pending dopo sessione / paid dopo webhook /
 *        expired dopo scadenza;
 *   T15  redirect: redirectUrl delle sessioni = URL mock di Stripe;
 *   T16  regressione buy-now POST /api/cliente/ordini (invariato).
 *
 * Cleanup COMPLETO in finally (eventi, sessioni, ordini, stock, varianti,
 * prodotti, negozi, config Stripe di test, utente, mock, server).
 *
 * Uso: npx tsx scripts/test-e2e-carrello-f26.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { chiavePerNegozio } from "../lib/cliente/ordini-carrello";
import { creaSessioneStripePerOrdine, elaboraPagamentiScaduti } from "../lib/pagamenti/sessioni";
import { gestisciWebhookStripe } from "../lib/pagamenti/webhook-stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

/** Chiave di cifratura TEST per le credenziali Stripe dei negozi F26. */
const CHIAVE_F26 = "chiave-f26-e2e-carrello-test-0001";

function loadEnv() {
  try {
    const raw = readFileSync(join(PROGETTO, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

const fail = (msg: string): never => {
  throw new Error(msg);
};

// ════════════════════════════════════════════════════════════════════
// Server dev
// ════════════════════════════════════════════════════════════════════

const PORTA = Number(process.env.F26_PORT ?? 3145);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "f26-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      RESEND_API_KEY: "",
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  const deadline = Date.now() + 240_000;
  let pronto = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        "Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "f26-next-dev.log")
      );
    }
    try {
      const res = await fetch(`${BASE}/api/cliente/ordini/carrello`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
        body: "{}",
      });
      if (res.status === 422) {
        pronto = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!pronto) {
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "f26-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE} (route compilata).\n`);
}

function fermaServer(): void {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch {}
  server = null;
}

// ════════════════════════════════════════════════════════════════════
// Mock Stripe (stesso pattern di test-pagamenti-f1 / test-checkout-carrello)
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe() {
  const chiamate: Array<{ url: string; method: string; body: string }> = [];
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      chiamate.push({ url: req.url ?? "", method: req.method ?? "GET", body });
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        contatore++;
        const id = `cs_test_f26_${contatore}`;
        return res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            status: "open",
            payment_status: "unpaid",
            expires_at: Math.floor(Date.now() / 1000) + 1800,
          })
        );
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  return new Promise<{ port: number; chiamate: typeof chiamate; chiudi: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        resolve({ port, chiamate, chiudi: () => new Promise((r) => server.close(() => r())) });
      });
    }
  );
}

// ════════════════════════════════════════════════════════════════════
// Helpers HTTP
// ════════════════════════════════════════════════════════════════════

let ipCounter = 40;

function ipProva(): string {
  ipCounter += 1;
  return `10.2.0.${ipCounter}`;
}

type RispostaJson = {
  status: number;
  success?: boolean;
  data?: { ordini?: any[]; errori?: any[]; ordine?: any; giaEsistente?: boolean };
  error?: { code?: string; message?: string };
};

async function postJson(path: string, body: unknown, opts?: { ip?: string; cookie?: string }): Promise<RispostaJson> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts?.ip ?? ipProva(),
  };
  if (opts?.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ...(json ?? {}) };
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_F26;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceRole || !anonKey) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ref = new URL(url).hostname.split(".")[0];
  const ts = Date.now();

  // ── Dati di test ────────────────────────────────────────────────────────
  let negozioAId: string | null = null;
  let negozioBId: string | null = null;
  let pA1: number | null = null; // negozio A: 10.00, stock 40
  let pA2: number | null = null; // negozio A: 20.50, stock 25
  let pAV: number | null = null; // negozio A: ha_varianti=true (padre)
  let v1Id: string | null = null; // variante M: 6.00, stock 10
  let pB: number | null = null; // negozio B: 3.00, stock 100

  let stockA1 = 40;
  let stockA2 = 25;
  let stockV1 = 10;
  let stockB = 100;

  const chiaviOrdini: string[] = [];
  const ordiniCreati: string[] = [];
  let utenteTestId: string | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── Setup negozi, prodotti, variante ──────────────────────────────────
    const { data: nA } = await db.from("negozi").insert({ nome: `F26-StoreA-${ts}`, slug: `f26-storea-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioAId = String(nA!.id);
    const { data: nB } = await db.from("negozi").insert({ nome: `F26-StoreB-${ts}`, slug: `f26-storeb-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioBId = String(nB!.id);

    const { data: q1 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F26-ProdottoA1-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false }).select("id").single();
    pA1 = Number(q1!.id);
    const { data: q2 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F26-ProdottoA2-${ts}`, prezzo: 20.5, quantita_disponibile: 25, attivo: true, ha_varianti: false }).select("id").single();
    pA2 = Number(q2!.id);
    const { data: qv } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F26-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true }).select("id").single();
    pAV = Number(qv!.id);
    const { data: v1 } = await db.from("prodotto_varianti").insert({ prodotto_id: pAV, nome: "F26-Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true }).select("id").single();
    v1Id = String(v1!.id);
    const { data: qB } = await db.from("prodotti").insert({ negozio_id: negozioBId, nome: `F26-ProdottoB-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false }).select("id").single();
    pB = Number(qB!.id);

    const ids = { pA1: String(pA1), pA2: String(pA2), pAV: String(pAV), v1: String(v1Id), pB: String(pB) };

    const baseCheckout = {
      modalita: "spedizione" as const,
      cliente: { nome: "Mario", cognome: "Rossi", telefono: "3331234567", email: "f26@localhub.test" },
      spedizione: {
        indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
        metodoSpedizione: "standard" as const, metodoPagamento: "bonifico" as const,
      },
    };

    await avviaServer();

    // ── T1: carrello vuoto → 422 ──────────────────────────────────────────
    console.log("\n[T1] Carrello vuoto → 422 VALIDATION_ERROR");
    {
      const esito = await postJson("/api/cliente/ordini/carrello", { ...baseCheckout, checkoutKey: `f26-t1-${ts}`, righe: [] });
      check("HTTP 422 VALIDATION_ERROR", esito.status === 422 && esito.error?.code === "VALIDATION_ERROR", { status: esito.status, code: esito.error?.code });
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `f26-t1%-${ts}%`);
      check("nessun ordine creato", Number(count ?? 0) === 0, count);
    }

    // ── T2: guest, 1 negozio multi-riga con VARIANTE → 201 ────────────────
    console.log("\n[T2] Guest, 1 negozio (legacy + variante), spedizione, bonifico → 201");
    let ordineT2Id: string | null = null;
    {
      const key = `f26-t2-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 2 },
          { prodottoId: ids.pAV, varianteId: ids.v1, quantita: 1 },
        ],
      });
      check("HTTP 201", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);
      const ordine = ordini[0];
      check("negozio risolto dal DB (A)", String(ordine?.negozioId) === negozioAId, ordine?.negozioId);
      check("totale server-side = 31.90 (10×2 + 6×1 + 5.90 spedizione)", Number(ordine?.totale) === 31.9, ordine?.totale);
      check("2 righe nello snapshot", Array.isArray(ordine?.righe) && ordine.righe.length === 2, ordine?.righe);
      check("bonifico → nessuna sessione (pagamento null)", ordine?.pagamento == null, ordine?.pagamento);
      const rigaV = ordine?.righe?.find((r: any) => r.prodottoId === ids.pAV);
      check("snapshot variante: prezzo 6.00 (variante, non padre)", Number(rigaV?.prezzoUnitario) === 6.0, rigaV);
      ordineT2Id = String(ordine?.ordineId);
      ordiniCreati.push(String(ordine?.ordineId));

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db.from("ordini").select("id, cliente_user_id, modalita").eq("idempotency_key", chiaveA).maybeSingle();
      check("ordine salvato con chiave derivata", Boolean(ordineDb?.id), ordineDb);
      check("guest → cliente_user_id NULL", ordineDb?.cliente_user_id == null, ordineDb?.cliente_user_id);

      stockA1 -= 2;
      stockV1 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA1).single();
      const { data: sV } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check(`stock A1 ${stockA1 + 2} → ${stockA1}`, Number(s1?.quantita_disponibile) === stockA1, s1?.quantita_disponibile);
      check(`stock variante M ${stockV1 + 1} → ${stockV1}`, Number(sV?.quantita_disponibile) === stockV1, sV?.quantita_disponibile);
    }

    // ── T3: guest MULTI-NEGOZIO → un ordine per negozio ───────────────────
    console.log("\n[T3] Multi-negozio → 2 ordini (uno per negozio)");
    {
      const key = `f26-t3-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
          { prodottoId: ids.pB, varianteId: null, quantita: 2 },
        ],
      });
      check("HTTP 201", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("2 ordini creati (uno per negozio)", ordini.length === 2, ordini);
      const oA = ordini.find((o: any) => String(o.negozioId) === negozioAId);
      const oB = ordini.find((o: any) => String(o.negozioId) === negozioBId);
      check("ordine A presente", Boolean(oA), ordini);
      check("ordine B presente", Boolean(oB), ordini);
      check("totale A = 36.40 (10 + 20.5 + 5.90)", oA && Number(oA.totale) === 36.4, oA?.totale);
      check("totale B = 11.90 (3×2 + 5.90 spedizione UNA volta)", oB && Number(oB.totale) === 11.9, oB?.totale);
      for (const o of ordini) ordiniCreati.push(String(o.ordineId));

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      const chiaveB = chiavePerNegozio(key, negozioBId!);
      chiaviOrdini.push(chiaveA, chiaveB);
      stockA1 -= 1;
      stockA2 -= 1;
      stockB -= 2;
      const { data: sB } = await db.from("prodotti").select("quantita_disponibile").eq("id", pB).single();
      check(`stock B ${stockB + 2} → ${stockB}`, Number(sB?.quantita_disponibile) === stockB, sB?.quantita_disponibile);
    }

    // ── T4: utente AUTENTICATO → cliente_user_id server-side ──────────────
    console.log("\n[T4] Utente autenticato (sessione Supabase reale)");
    let cookie: string | null = null;
    {
      const emailUtente = `f26-user-${ts}@localhub.test`;
      const { data: creato, error: errCrea } = await db.auth.admin.createUser({ email: emailUtente, password: "PasswordF26!2026", email_confirm: true });
      if (errCrea || !creato?.user?.id) fail("Creazione utente di test fallita: " + (errCrea?.message ?? ""));
      utenteTestId = creato!.user!.id;

      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "content-type": "application/json" },
        body: JSON.stringify({ email: emailUtente, password: "PasswordF26!2026" }),
      });
      const tok: any = await res.json();
      check("sign-in utente test ok", res.status === 200 && Boolean(tok.access_token), { status: res.status });
      if (!tok.access_token) fail("Sign-in utente test fallito");
      const sessioneCookie = JSON.stringify({
        access_token: tok.access_token, refresh_token: tok.refresh_token,
        expires_at: tok.expires_at, expires_in: tok.expires_in, token_type: tok.token_type ?? "bearer",
      });
      cookie = `sb-${ref}-auth-token=base64-${Buffer.from(sessioneCookie).toString("base64url")}`;

      const key = `f26-t4-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key,
        modalita: "ritiro",
        cliente: { nome: "Luigi", cognome: "Verdi", telefono: null, email: null },
        ritiro: { data: "2026-10-01", fascia: "10:00–11:00" },
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
        ],
      }, { cookie });
      check("HTTP 201 (autenticato)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);
      check("ritiro → totale SENZA spedizione = 30.50", Number(ordini[0]?.totale) === 30.5, ordini[0]?.totale);
      for (const o of ordini) ordiniCreati.push(String(o.ordineId));

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db.from("ordini").select("cliente_user_id").eq("idempotency_key", chiaveA).maybeSingle();
      check("cliente_user_id = utente della SESSIONE (server-side)", ordineDb?.cliente_user_id === utenteTestId, ordineDb?.cliente_user_id);
      stockA1 -= 1;
      stockA2 -= 1;
    }

    // ── T5: variante obbligatoria → 422 ───────────────────────────────────
    console.log("\n[T5] Prodotto ha_varianti senza varianteId → 422 VARIANTE_OBBLIGATORIA");
    {
      const key = `f26-t5-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [{ prodottoId: ids.pAV, varianteId: null, quantita: 1 }],
      });
      check("HTTP 422 VARIANTE_OBBLIGATORIA", esito.status === 422 && esito.error?.code === "VARIANTE_OBBLIGATORIA", { status: esito.status, code: esito.error?.code });
      const { data: oA } = await db.from("ordini").select("id").eq("idempotency_key", chiavePerNegozio(key, negozioAId!)).maybeSingle();
      check("nessun ordine creato", oA == null, oA);
    }

    // ── T6: stock insufficiente su UN negozio → errore isolato ────────────
    console.log("\n[T6] Stock insufficiente su negozio B → ordine A intatto");
    {
      const key = `f26-t6-${ts}`;
      await db.from("prodotti").update({ quantita_disponibile: 2 }).eq("id", pB);
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
          { prodottoId: ids.pB, varianteId: null, quantita: 5 },
        ],
      });
      await db.from("prodotti").update({ quantita_disponibile: stockB }).eq("id", pB);
      check("HTTP 201 (almeno un ordine nuovo)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      const errori = esito.data?.errori ?? [];
      check("1 ordine creato (negozio A)", ordini.length === 1 && String(ordini[0]?.negozioId) === negozioAId, ordini);
      check("1 errore per il negozio B", errori.length === 1 && String(errori[0]?.negozioId) === negozioBId, errori);
      check("errore SCORTE_INSUFFICIENTI", errori[0]?.codice === "SCORTE_INSUFFICIENTI", errori[0]);
      for (const o of ordini) ordiniCreati.push(String(o.ordineId));
      const { data: oB } = await db.from("ordini").select("id").eq("idempotency_key", chiavePerNegozio(key, negozioBId!)).maybeSingle();
      check("nessun ordine parziale per B (rollback RPC)", oB == null, oB);
      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      stockA1 -= 1;
      stockA2 -= 1;
    }

    // ── T7: IDEMPOTENZA (stessa checkoutKey) ──────────────────────────────
    console.log("\n[T7] Idempotenza: stessa checkoutKey → 200, stock UNA volta");
    {
      const key = `f26-t7-${ts}`;
      const body = {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
        ],
      };
      const r1 = await postJson("/api/cliente/ordini/carrello", body);
      check("primo invio → 201", r1.status === 201 && r1.data?.ordini?.[0]?.giaEsistente === false, { status: r1.status });
      const primoId = r1.data?.ordini?.[0]?.ordineId;
      if (!primoId) fail("T7: primo invio senza ordine");
      ordiniCreati.push(String(primoId));

      const r2 = await postJson("/api/cliente/ordini/carrello", body);
      check("secondo invio (stessa key) → 200", r2.status === 200 && r2.data?.ordini?.[0]?.giaEsistente === true, { status: r2.status });
      check("stesso ordine restituito", r2.data?.ordini?.[0]?.ordineId === primoId, r2.data?.ordini?.[0]?.ordineId);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).eq("idempotency_key", chiaveA);
      check("un solo ordine nel DB", Number(count ?? 0) === 1, count);

      stockA1 -= 1;
      stockA2 -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA1).single();
      check(`stock A1 decrementato UNA volta (${stockA1 + 1} → ${stockA1})`, Number(s1?.quantita_disponibile) === stockA1, s1?.quantita_disponibile);
    }

    // ── T8: DOPPIO CHECKOUT (chiavi diverse) → 2 ordini distinti ──────────
    console.log("\n[T8] Doppio checkout (chiavi diverse) → 2 ordini distinti");
    {
      const righe = [{ prodottoId: ids.pA1, varianteId: null, quantita: 1 }];
      const r1 = await postJson("/api/cliente/ordini/carrello", { checkoutKey: `f26-t8a-${ts}`, ...baseCheckout, righe });
      const r2 = await postJson("/api/cliente/ordini/carrello", { checkoutKey: `f26-t8b-${ts}`, ...baseCheckout, righe });
      check("primo checkout → 201", r1.status === 201, r1.status);
      check("secondo checkout (chiave diversa) → 201", r2.status === 201, r2.status);
      const id1 = r1.data?.ordini?.[0]?.ordineId;
      const id2 = r2.data?.ordini?.[0]?.ordineId;
      check("ordini DIVERSI (chiavi diverse)", Boolean(id1 && id2 && id1 !== id2), { id1, id2 });
      ordiniCreati.push(String(id1), String(id2));
      chiaviOrdini.push(chiavePerNegozio(`f26-t8a-${ts}`, negozioAId!), chiavePerNegozio(`f26-t8b-${ts}`, negozioAId!));
      stockA1 -= 2;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA1).single();
      check(`stock A1 decrementato per entrambi (${stockA1 + 2} → ${stockA1})`, Number(s1?.quantita_disponibile) === stockA1, s1?.quantita_disponibile);
    }

    // ── T9: SESSIONI STRIPE SEPARATE (mock) ───────────────────────────────
    console.log("\n[T9] Sessioni Stripe separate: UN ordine = UNA sessione");
    let sessioneA: { ordineId: string; redirectUrl: string; sessioneId: string; giaEsistente: boolean } | null = null;
    let sessioneB: { ordineId: string; redirectUrl: string; sessioneId: string; giaEsistente: boolean } | null = null;
    {
      // Configura Stripe TEST (cifrata con CHIAVE_F26) per i due negozi.
      for (const nid of [negozioAId!, negozioBId!]) {
        const { error: cfgErr } = await db.rpc("pagamenti_credenziali_salva", {
          p_negozio_id: nid,
          p_provider: "stripe",
          p_attivo: true,
          p_test_mode: true,
          p_secret: "sk_test_f26_mock",
          p_webhook_secret: "whsec_f26_test",
          p_chiave: CHIAVE_F26,
        });
        if (cfgErr) fail("Salvataggio config Stripe F26 fallito: " + cfgErr.message);
      }
      mockStripe = await avviaMockStripe();
      const gatewayOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };

      // 2 ordini via API (bonifico: la route NON crea la sessione), poi una
      // sessione per ciascuno con il VERO orchestratore + gateway mock.
      const key = `f26-t9-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 }, // negozio A
          { prodottoId: ids.pB, varianteId: null, quantita: 1 }, // negozio B
        ],
      });
      const ordini = esito.data?.ordini ?? [];
      check("2 ordini creati per T9", ordini.length === 2, ordini);
      for (const o of ordini) ordiniCreati.push(String(o.ordineId));
      chiaviOrdini.push(chiavePerNegozio(key, negozioAId!), chiavePerNegozio(key, negozioBId!));

      const sessioni: Array<{ ordineId: string; redirectUrl: string; sessioneId: string; giaEsistente: boolean }> = [];
      for (const ordine of ordini) {
        const sessione = await creaSessioneStripePerOrdine(String(ordine.ordineId), gatewayOpts);
        if (!sessione.ok) {
          throw new Error("T9: creazione sessione fallita: " + sessione.errore);
        }
        sessioni.push({
          ordineId: String(ordine.ordineId),
          redirectUrl: sessione.redirectUrl,
          sessioneId: sessione.sessioneId,
          giaEsistente: sessione.giaEsistente,
        });
      }
      sessioneA = sessioni[0];
      sessioneB = sessioni[1];
      check("2 sessioni create (una per ordine)", sessioni.length === 2, sessioni);
      check("redirectUrl distinti", sessioneA!.redirectUrl !== sessioneB!.redirectUrl, sessioni.map((s) => s.redirectUrl));
      check("sessioneId distinti", sessioneA!.sessioneId !== sessioneB!.sessioneId, sessioni.map((s) => s.sessioneId));

      const bodyChiamate = mockStripe.chiamate.map((c) => decodeURIComponent(c.body));
      check("2 chiamate POST /v1/checkout/sessions", mockStripe.chiamate.filter((c) => c.method === "POST" && c.url.startsWith("/v1/checkout/sessions")).length === 2, mockStripe.chiamate.length);
      check("client_reference_id = ordine A", bodyChiamate[0]?.includes(`client_reference_id=${sessioni[0].ordineId}`), bodyChiamate[0]?.slice(0, 180));
      check("client_reference_id = ordine B", bodyChiamate[1]?.includes(`client_reference_id=${sessioni[1].ordineId}`), bodyChiamate[1]?.slice(0, 180));

      const { count } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).in("ordine_id", sessioni.map((s) => s.ordineId)).eq("status", "created");
      check("2 sessioni attive totali (una per ordine)", Number(count ?? 0) === 2, count);

      const { data: ordiniAggiornati } = await db.from("ordini").select("id, payment_provider, payment_status").in("id", sessioni.map((s) => s.ordineId));
      check("payment_provider = stripe dopo la sessione", (ordiniAggiornati ?? []).every((o) => o.payment_provider === "stripe"), ordiniAggiornati);
      check("payment_status = pending dopo la sessione", (ordiniAggiornati ?? []).every((o) => o.payment_status === "pending"), ordiniAggiornati);

      stockA1 -= 1;
      stockB -= 1;
    }

    // ── T10: RETRY pagamento → stessa sessione attiva ─────────────────────
    console.log("\n[T10] Retry pagamento → riuso della sessione attiva");
    {
      const chiamatePrima = mockStripe!.chiamate.length;
      const retry = await creaSessioneStripePerOrdine(sessioneA!.ordineId, { host: "127.0.0.1", port: mockStripe!.port, protocol: "http" as const });
      check("retry ok + giaEsistente=true", retry.ok && "giaEsistente" in retry && retry.giaEsistente === true, retry);
      check("stessa sessione restituita", retry.ok && "sessioneId" in retry && retry.sessioneId === sessioneA!.sessioneId, retry);
      check("nessuna nuova chiamata HTTP a Stripe", mockStripe!.chiamate.length === chiamatePrima, mockStripe!.chiamate.length);
    }

    // ── T11: WEBHOOK checkout.session.completed → paid ────────────────────
    console.log("\n[T11] Webhook checkout.session.completed → paid (firma reale)");
    {
      const { data: sessioneDb } = await db.from("pagamenti_sessioni").select("payment_id, amount").eq("ordine_id", sessioneA!.ordineId).single();
      const paymentIdSessione = String(sessioneDb?.payment_id ?? "");
      const importoSessione = Number(sessioneDb?.amount ?? 0);
      const payloadWebhook = JSON.stringify({
        id: "evt_f26_completed_1",
        object: "event",
        api_version: "2024-06-20",
        type: "checkout.session.completed",
        data: {
          object: {
            id: paymentIdSessione,
            client_reference_id: sessioneA!.ordineId,
            metadata: { ordine_id: sessioneA!.ordineId, negozio_id: negozioAId },
            payment_status: "paid",
            amount_total: Math.round(importoSessione * 100),
            currency: "eur",
            payment_intent: "pi_test_f26",
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({ payload: payloadWebhook, secret: "whsec_f26_test" });
      const esito = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook completed → HTTP 200", esito.status === 200, esito);

      const { data: ordineDb } = await db.from("ordini").select("payment_status, payment_provider, payment_transaction_id, payment_paid_at, payment_amount").eq("id", sessioneA!.ordineId).single();
      check("payment_status = 'paid'", ordineDb?.payment_status === "paid", ordineDb);
      check("payment_provider RESTA 'stripe'", ordineDb?.payment_provider === "stripe", ordineDb);
      check("payment_transaction_id = pi_test_f26", ordineDb?.payment_transaction_id === "pi_test_f26", ordineDb?.payment_transaction_id);
      check("payment_paid_at valorizzato", Boolean(ordineDb?.payment_paid_at), ordineDb?.payment_paid_at);
      check("payment_amount = totale sessione", Number(ordineDb?.payment_amount ?? 0) === importoSessione, ordineDb?.payment_amount);

      const { data: sessionePost } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", sessioneA!.ordineId).single();
      check("sessione → status 'paid'", sessionePost?.status === "paid", sessionePost);

      const { data: eventoDb } = await db.from("pagamenti_eventi").select("event_id, status").eq("event_id", "evt_f26_completed_1").maybeSingle();
      check("evento registrato e processato", eventoDb?.event_id === "evt_f26_completed_1" && eventoDb?.status === "processed", eventoDb);

      // Duplicato → idempotente, non riprocessato
      const esito2 = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook duplicato → 200 'già processato'", esito2.status === 200, esito2);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", "evt_f26_completed_1");
      check("un solo evento nel DB", Number(count ?? 0) === 1, count);
    }

    // ── T12: WEBHOOK checkout.session.expired → ripristino stock ──────────
    console.log("\n[T12] Webhook checkout.session.expired → ordine cancellato + STOCK RIPRISTINATO");
    {
      const { data: sessioneDb } = await db.from("pagamenti_sessioni").select("payment_id").eq("ordine_id", sessioneB!.ordineId).single();
      const paymentIdSessione = String(sessioneDb?.payment_id ?? "");
      const payloadWebhook = JSON.stringify({
        id: "evt_f26_expired_1",
        object: "event",
        api_version: "2024-06-20",
        type: "checkout.session.expired",
        data: {
          object: {
            id: paymentIdSessione,
            client_reference_id: sessioneB!.ordineId,
            metadata: { ordine_id: sessioneB!.ordineId, negozio_id: negozioBId },
            payment_status: "unpaid",
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({ payload: payloadWebhook, secret: "whsec_f26_test" });
      const esito = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook expired → HTTP 200", esito.status === 200, esito);

      const { data: ordineDb } = await db.from("ordini").select("stato, payment_status, annullato_motivo").eq("id", sessioneB!.ordineId).single();
      check("ordine → cancellato (pagamento_scaduto)", ordineDb?.stato === "cancellato" && ordineDb?.annullato_motivo === "pagamento_scaduto", ordineDb);
      check("payment_status → expired", ordineDb?.payment_status === "expired", ordineDb?.payment_status);

      const { data: sessionePost } = await db.from("pagamenti_sessioni").select("status").eq("ordine_id", sessioneB!.ordineId).single();
      check("sessione → status 'expired'", sessionePost?.status === "expired", sessionePost);

      stockB += 1;
      const { data: sB } = await db.from("prodotti").select("quantita_disponibile").eq("id", pB).single();
      check(`stock B ripristinato (${stockB - 1} → ${stockB})`, Number(sB?.quantita_disponibile) === stockB, sB?.quantita_disponibile);
    }

    // ── T13: SCAdenza sweep (elaboraPagamentiScaduti) → ripristino stock ──
    console.log("\n[T13] Scadenza (payment_expires_at passato) → sweep → ripristino stock");
    let ordineT13Id: string | null = null;
    {
      const key = `f26-t13-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [{ prodottoId: ids.pA2, varianteId: null, quantita: 1 }],
      });
      const ordine = esito.data?.ordini?.[0];
      if (!ordine?.ordineId) fail("T13: ordine non creato");
      ordineT13Id = String(ordine.ordineId);
      ordiniCreati.push(ordineT13Id);
      chiaviOrdini.push(chiavePerNegozio(key, negozioAId!));
      stockA2 -= 1;

      // Crea la sessione (→ pending con expires_at +30min) poi simula la
      // scadenza naturale mettendo payment_expires_at nel passato.
      const sessione = await creaSessioneStripePerOrdine(ordineT13Id, { host: "127.0.0.1", port: mockStripe!.port, protocol: "http" as const });
      if (!sessione.ok) fail("T13: sessione fallita: " + sessione.errore);
      const { data: oDb } = await db.from("ordini").select("payment_status").eq("id", ordineT13Id).single();
      check("ordine pending dopo la sessione", oDb?.payment_status === "pending", oDb);

      // Simula la scadenza NATURALE: scadono sia l'ordine (payment_expires_at)
      // sia la SESSIONE (expires_at). La RPC pagamenti_ordine_scaduto ha una
      // guardia anti-retry (sessione attiva NON scaduta → no-op, per non
      // annullare un ordine che l'utente sta ancora pagando): una sessione
      // davvero scaduta non la innesca, come nel flusso reale.
      const oraPassata = new Date(Date.now() - 60_000).toISOString();
      await db.from("ordini").update({ payment_expires_at: oraPassata }).eq("id", ordineT13Id);
      await db.from("pagamenti_sessioni").update({ expires_at: oraPassata }).eq("ordine_id", ordineT13Id);
      const processati = await elaboraPagamentiScaduti(10);
      check("sweep ha processato l'ordine scaduto", processati >= 1, processati);

      const { data: ordineDb } = await db.from("ordini").select("stato, payment_status").eq("id", ordineT13Id).single();
      check("ordine → cancellato (pagamento_scaduto)", ordineDb?.stato === "cancellato", ordineDb);
      check("payment_status → expired", ordineDb?.payment_status === "expired", ordineDb?.payment_status);

      stockA2 += 1;
      const { data: sA2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA2).single();
      check(`stock A2 ripristinato (${stockA2 - 1} → ${stockA2})`, Number(sA2?.quantita_disponibile) === stockA2, sA2?.quantita_disponibile);
    }

    // ── T14: stati ordini (pending / paid / expired) ──────────────────────
    console.log("\n[T14] Stati ordini: pending → paid → expired");
    {
      const { data: paid } = await db.from("ordini").select("payment_status, payment_provider").eq("id", sessioneA!.ordineId).single();
      const { data: expired } = await db.from("ordini").select("payment_status").eq("id", sessioneB!.ordineId).single();
      check("ordine T11 → paid", paid?.payment_status === "paid", paid);
      check("ordine T12 → expired", expired?.payment_status === "expired", expired);
      check("payment_provider resta stripe su ordine paid", paid?.payment_provider === "stripe", paid?.payment_provider);
    }

    // ── T15: redirect URL delle sessioni ──────────────────────────────────
    console.log("\n[T15] Redirect URL delle sessioni = URL mock di Stripe");
    {
      check("redirectUrl A = https://checkout.stripe.com/c/pay/...", String(sessioneA!.redirectUrl).startsWith("https://checkout.stripe.com/c/pay/"), sessioneA!.redirectUrl);
      check("redirectUrl B = https://checkout.stripe.com/c/pay/...", String(sessioneB!.redirectUrl).startsWith("https://checkout.stripe.com/c/pay/"), sessioneB!.redirectUrl);
    }

    // ── T16: regressione buy-now ──────────────────────────────────────────
    console.log("\n[T16] Regressione buy-now POST /api/cliente/ordini (invariato)");
    {
      const key = `f26-bn-${ts}`;
      const body = {
        idempotencyKey: key,
        prodottoId: ids.pA1,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "Bianchi", telefono: null, email: "f26-bn@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 2", cap: "87100", citta: "Cosenza", provincia: "CS",
          metodoSpedizione: "standard", metodoPagamento: "bonifico",
        },
      };
      const r1 = await postJson("/api/cliente/ordini", body);
      check("buy-now → 201 con ordine", r1.status === 201 && Boolean(r1.data?.ordine?.id), { status: r1.status, ordine: r1.data?.ordine });
      const primoId = r1.data?.ordine?.id;
      if (!primoId) fail("T16: buy-now senza ordine");
      ordiniCreati.push(String(primoId));
      chiaviOrdini.push(key);
      const r2 = await postJson("/api/cliente/ordini", body);
      check("retry buy-now → 200 giaEsistente", r2.status === 200 && r2.data?.giaEsistente === true, { status: r2.status });
      stockA1 -= 1;
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`E2E CARRELLO/CHECKOUT TEST (F2.6): ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST F2.6 ──");
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      const { error: delOrdini } = await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `f26-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `f26-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui} eliminati`);
      }
    }
    // Ripristino stock ai valori iniziali
    if (pA1 !== null) await db.from("prodotti").update({ quantita_disponibile: 40 }).eq("id", pA1);
    if (pA2 !== null) await db.from("prodotti").update({ quantita_disponibile: 25 }).eq("id", pA2);
    if (pB !== null) await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pB);
    if (v1Id !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", v1Id);
    // Varianti → prodotti → negozi → config Stripe di test
    if (pAV !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pAV);
      await db.from("prodotti").delete().eq("id", pAV);
    }
    for (const id of [pA1, pA2, pB]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioAId, negozioBId]) {
      if (id) {
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id).eq("provider", "stripe");
        await db.from("negozi").delete().eq("id", id);
      }
    }
    if (utenteTestId) {
      await db.auth.admin.deleteUser(utenteTestId).catch(() => {});
      console.log("  Utente di test eliminato");
    }
    fermaServer();
    console.log("  Server dev fermato.");
    console.log("  Dati di test F2.6 eliminati (ordini, sessioni, eventi, stock, varianti, prodotti, negozi, config, utente).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
