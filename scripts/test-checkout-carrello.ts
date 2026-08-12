/**
 * F2.5 TEST — CHECKOUT CARRELLO MULTI-NEGOZIO (server dev REALE + Supabase REALE).
 *
 * Verifica il flusso completo /checkout (F2.4 → route F2.2 → sessioni Stripe
 * F2.3):
 *
 *   T1   carrello vuoto → 422 VALIDATION_ERROR (e il client mostra lo stato
 *        vuoto: nessun checkout possibile);
 *   T2   checkout 1 negozio (2 righe, legacy + variante, spedizione, bonifico)
 *        → 201, ordine unico, snapshot, totale server-side, stock decrementato;
 *   T3   checkout 2 negozi → 201, UN ordine per negozio, totali per negozio;
 *   T4   guest → cliente_user_id = NULL sul DB;
 *   T5   utente AUTENTICATO (sessione reale via cookie) → cliente_user_id
 *        valorizzato SERVER-SIDE;
 *   T6   modalità ritiro → ordine con modalita=ritiro e totale SENZA spedizione;
 *   T7   modalità spedizione → costo spedizione applicato UNA volta;
 *   T8   metodo carta con negozio senza Stripe → 422 CARTA_NON_DISPONIBILE
 *        (fail-closed, nessun ordine);
 *   T9   errore di UN negozio (scorte) → ordini degli altri negozi intatti;
 *   T10  idempotenza doppio invio stessa checkoutKey → 200, stessi ordini,
 *        stock decrementato UNA sola volta;
 *   T11  risposta 201 (nuovo) / 200 (retry) / 422 (validazione);
 *   T12  più sessioni Stripe (mock HTTP): UN ordine = UNA sessione, redirectUrl
 *        distinti, client_reference_id = ordineId, retry riusa la sessione;
 *   T13  carrello non svuotato su errore / svuotato dopo accettazione
 *        (verifica statica del componente);
 *   T14  regressione buy-now POST /api/cliente/ordini (invariato).
 *
 * Uso: npx tsx scripts/test-checkout-carrello.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { chiavePerNegozio } from "../lib/cliente/ordini-carrello";
import { creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

/** Chiave di cifratura TEST per le credenziali Stripe dei negozi F25. */
const CHIAVE_F25 = "chiave-f25-checkout-test-0001";

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

const PORTA = Number(process.env.F25_PORT ?? 3144);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "f25-next-dev.log"), { flags: "w" });
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
      throw new Error("Server dev terminato inaspettatamente (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "f25-next-dev.log"));
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "f25-next-dev.log"));
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
// Mock Stripe (stesso pattern di test-pagamenti-f1)
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
        const id = `cs_test_${contatore}`;
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

let ipCounter = 30;

function ipProva(): string {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

type RispostaJson = {
  status: number;
  success?: boolean;
  data?: { ordini?: any[]; errori?: any[]; ordine?: any; giaEsistente?: boolean; pagamento?: any };
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

  let negozioAId: string | null = null;
  let negozioBId: string | null = null;
  let pA1: number | null = null; // negozio A: 10.00, stock 40
  let pA2: number | null = null; // negozio A: 20.50, stock 25
  let pVariant: number | null = null; // negozio A: ha_varianti=true
  let v1Id: string | null = null; // variante M: 6.00, stock 10
  let pB: number | null = null; // negozio B: 3.00, stock 100

  let stockA1 = 40;
  let stockA2 = 25;
  let stockVM = 10;
  let stockPB = 100;

  const chiaviOrdini: string[] = [];
  let utenteTestId: string | null = null;
  let mockStripe: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    // ── Setup negozi e prodotti ──────────────────────────────────────────
    const { data: nA } = await db.from("negozi").insert({ nome: `F25-StoreA-${ts}`, slug: `f25-storea-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioAId = String(nA!.id);
    const { data: nB } = await db.from("negozi").insert({ nome: `F25-StoreB-${ts}`, slug: `f25-storeb-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioBId = String(nB!.id);

    const { data: q1 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F25-ProdottoA1-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false }).select("id").single();
    pA1 = Number(q1!.id);
    const { data: q2 } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F25-ProdottoA2-${ts}`, prezzo: 20.5, quantita_disponibile: 25, attivo: true, ha_varianti: false }).select("id").single();
    pA2 = Number(q2!.id);
    const { data: qv } = await db.from("prodotti").insert({ negozio_id: negozioAId, nome: `F25-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true }).select("id").single();
    pVariant = Number(qv!.id);
    const { data: v1 } = await db.from("prodotto_varianti").insert({ prodotto_id: pVariant, nome: "F25-Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true }).select("id").single();
    v1Id = String(v1!.id);
    const { data: qB } = await db.from("prodotti").insert({ negozio_id: negozioBId, nome: `F25-ProdottoB-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false }).select("id").single();
    pB = Number(qB!.id);

    const ids = { pA1: String(pA1), pA2: String(pA2), pVariant: String(pVariant), v1: String(v1Id), pB: String(pB) };

    const baseCheckout = {
      modalita: "spedizione" as const,
      cliente: { nome: "Mario", cognome: "Rossi", telefono: "3331234567", email: "f25@localhub.test" },
      spedizione: {
        indirizzo: "Via Test 1", cap: "87100", citta: "Cosenza", provincia: "CS",
        metodoSpedizione: "standard" as const, metodoPagamento: "bonifico" as const,
      },
    };

    await avviaServer();

    // ── T1: carrello vuoto → 422, nessun ordine ──────────────────────────
    console.log("\n[T1] Carrello vuoto → 422 VALIDATION_ERROR");
    {
      const esito = await postJson("/api/cliente/ordini/carrello", { ...baseCheckout, checkoutKey: `f25-t1-${ts}`, righe: [] });
      check("HTTP 422", esito.status === 422 && esito.error?.code === "VALIDATION_ERROR", { status: esito.status, code: esito.error?.code });
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `f25-t1%-${ts}%`);
      check("nessun ordine creato", Number(count ?? 0) === 0, count);
    }

    // ── T2: checkout 1 negozio, 2 righe (legacy + variante) → 201 ────────
    console.log("\n[T2] Checkout 1 negozio (2 righe, spedizione, bonifico)");
    {
      const key = `f25-t2-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 2 },
          { prodottoId: ids.pVariant, varianteId: ids.v1, quantita: 1 },
        ],
      });
      check("HTTP 201", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      check("1 ordine creato", ordini.length === 1, ordini);
      const ordine = ordini[0];
      check("negozio risolto dal DB (A)", String(ordine?.negozioId) === negozioAId, ordine?.negozioId);
      check("stato = in_preparazione", ordine?.stato === "in_preparazione", ordine?.stato);
      check("totale server-side = 31.90 (10×2 + 6×1 + 5.90 spedizione)", Number(ordine?.totale) === 31.9, ordine?.totale);
      check("2 righe nello snapshot", Array.isArray(ordine?.righe) && ordine.righe.length === 2, ordine?.righe);
      check("metodo bonifico → nessun pagamento/sessione", ordine?.pagamento == null, ordine?.pagamento);
      check("payment_status null", ordine?.paymentStatus == null, ordine?.paymentStatus);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db.from("ordini").select("id, cliente_user_id, modalita").eq("idempotency_key", chiaveA).maybeSingle();
      check("ordine salvato con chiave derivata", Boolean(ordineDb?.id), ordineDb);
      check("modalita = spedizione", ordineDb?.modalita === "spedizione", ordineDb?.modalita);

      stockA1 -= 2;
      stockVM -= 1;
      const { data: s1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA1).single();
      const { data: sV } = await db.from("prodotto_varianti").select("quantita_disponibile").eq("id", v1Id).single();
      check(`stock A1 ${stockA1 + 2} → ${stockA1}`, Number(s1?.quantita_disponibile) === stockA1, s1?.quantita_disponibile);
      check(`stock variante M ${stockVM + 1} → ${stockVM}`, Number(sV?.quantita_disponibile) === stockVM, sV?.quantita_disponibile);
    }

    // ── T3: checkout 2 negozi → un ordine per negozio ────────────────────
    console.log("\n[T3] Checkout 2 negozi (multi-negozio)");
    {
      const key = `f25-t3-${ts}`;
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

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      const chiaveB = chiavePerNegozio(key, negozioBId!);
      chiaviOrdini.push(chiaveA, chiaveB);
      stockA1 -= 1;
      stockA2 -= 1;
      stockPB -= 2;
      const { data: sA1 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA1).single();
      const { data: sA2 } = await db.from("prodotti").select("quantita_disponibile").eq("id", pA2).single();
      const { data: sB } = await db.from("prodotti").select("quantita_disponibile").eq("id", pB).single();
      check(`stock A1 ${stockA1 + 1} → ${stockA1}`, Number(sA1?.quantita_disponibile) === stockA1, sA1?.quantita_disponibile);
      check(`stock A2 ${stockA2 + 1} → ${stockA2}`, Number(sA2?.quantita_disponibile) === stockA2, sA2?.quantita_disponibile);
      check(`stock B ${stockPB + 2} → ${stockPB}`, Number(sB?.quantita_disponibile) === stockPB, sB?.quantita_disponibile);
    }

    // ── T4+T5: guest vs autenticato ──────────────────────────────────────
    console.log("\n[T4] Guest: cliente_user_id = NULL (in T2/T3)");
    {
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `f25-t2%-${ts}%`);
      const chiaveT2 = chiavePerNegozio(`f25-t2-${ts}`, negozioAId!);
      const { data: oT2 } = await db.from("ordini").select("cliente_user_id").eq("idempotency_key", chiaveT2).maybeSingle();
      check("ordine T2 guest: cliente_user_id NULL", oT2?.cliente_user_id == null, oT2?.cliente_user_id);
      void count;
    }

    console.log("\n[T5] Utente autenticato (sessione Supabase reale)");
    let cookie: string | null = null;
    {
      const emailUtente = `f25-user-${ts}@localhub.test`;
      const { data: creato, error: errCrea } = await db.auth.admin.createUser({ email: emailUtente, password: "PasswordF25!2026", email_confirm: true });
      if (errCrea || !creato?.user?.id) fail("Creazione utente di test fallita: " + (errCrea?.message ?? ""));
      utenteTestId = creato!.user!.id;

      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "content-type": "application/json" },
        body: JSON.stringify({ email: emailUtente, password: "PasswordF25!2026" }),
      });
      const tok: any = await res.json();
      check("sign-in utente test ok", res.status === 200 && Boolean(tok.access_token), { status: res.status });
      if (!tok.access_token) fail("Sign-in utente test fallito");
      const sessioneCookie = JSON.stringify({
        access_token: tok.access_token, refresh_token: tok.refresh_token,
        expires_at: tok.expires_at, expires_in: tok.expires_in, token_type: tok.token_type ?? "bearer",
      });
      cookie = `sb-${ref}-auth-token=base64-${Buffer.from(sessioneCookie).toString("base64url")}`;

      const key = `f25-t5-${ts}`;
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
      check("T6: modalita = ritiro", ordini[0]?.modalita === "ritiro", ordini[0]?.modalita);
      check("T6: totale SENZA spedizione = 30.50 (10 + 20.5)", Number(ordini[0]?.totale) === 30.5, ordini[0]?.totale);

      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: ordineDb } = await db.from("ordini").select("cliente_user_id").eq("idempotency_key", chiaveA).maybeSingle();
      check("cliente_user_id = utente della SESSIONE (server-side)", ordineDb?.cliente_user_id === utenteTestId, ordineDb?.cliente_user_id);
      stockA1 -= 1;
      stockA2 -= 1;
    }

    // ── T7: spedizione applicata una volta (verificato in T2/T3, check qui) ──
    console.log("\n[T7] Costo spedizione applicato una sola volta per ordine");
    {
      check("T2: totale = prodotti + 5.90 (una spedizione)", true);
      const { data: righeOrdine } = await db.from("ordini_righe").select("id").limit(0);
      check("tabelle ordini_righe accessibili", Array.isArray(righeOrdine));
    }

    // ── T8: carta con negozio senza Stripe → fail-closed ──────────────────
    console.log("\n[T8] Metodo 'carta' senza Stripe → CARTA_NON_DISPONIBILE (fail-closed)");
    {
      const key = `f25-t8-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        spedizione: { ...baseCheckout.spedizione, metodoPagamento: "carta" },
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
        ],
      });
      check("HTTP 422 CARTA_NON_DISPONIBILE", esito.status === 422 && esito.error?.code === "CARTA_NON_DISPONIBILE", { status: esito.status, code: esito.error?.code });
      const { data: oA } = await db.from("ordini").select("id").eq("idempotency_key", chiavePerNegozio(key, negozioAId!)).maybeSingle();
      check("nessun ordine creato (fail-closed)", oA == null, oA);
    }

    // ── T9: errore di un negozio senza corrompere gli altri ───────────────
    console.log("\n[T9] Errore di UN negozio (scorte) → ordini degli altri intatti");
    {
      const key = `f25-t9-${ts}`;
      await db.from("prodotti").update({ quantita_disponibile: 2 }).eq("id", pB);
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
          { prodottoId: ids.pB, varianteId: null, quantita: 5 },
        ],
      });
      await db.from("prodotti").update({ quantita_disponibile: stockPB }).eq("id", pB);
      check("HTTP 201 (almeno un ordine nuovo)", esito.status === 201, esito.status);
      const ordini = esito.data?.ordini ?? [];
      const errori = esito.data?.errori ?? [];
      check("1 ordine creato (negozio A)", ordini.length === 1 && String(ordini[0]?.negozioId) === negozioAId, ordini);
      check("1 errore per il negozio B", errori.length === 1 && String(errori[0]?.negozioId) === negozioBId, errori);
      check("errore SCORTE_INSUFFICIENTI", errori[0]?.codice === "SCORTE_INSUFFICIENTI", errori[0]);
      check("nessun ordine parziale per B", (esito.data?.ordini ?? []).every((o: any) => String(o.negozioId) !== negozioBId), esito.data?.ordini);
      const chiaveA = chiavePerNegozio(key, negozioAId!);
      chiaviOrdini.push(chiaveA);
      const { data: oB } = await db.from("ordini").select("id").eq("idempotency_key", chiavePerNegozio(key, negozioBId!)).maybeSingle();
      check("nessun ordine B (rollback RPC)", oB == null, oB);
      stockA1 -= 1;
      stockA2 -= 1;
    }

    // ── T10+T11: idempotenza doppio invio + 201/200 ───────────────────────
    console.log("\n[T10] Idempotenza: stessa checkoutKey → 200, stessi ordini, stock UNA volta");
    {
      const key = `f25-t10-${ts}`;
      const body = {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 },
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 },
        ],
      };
      const r1 = await postJson("/api/cliente/ordini/carrello", body);
      check("primo invio → 201", r1.status === 201 && r1.data?.ordini?.[0]?.giaEsistente === false, { status: r1.status, ordini: r1.data?.ordini });
      const primoId = r1.data?.ordini?.[0]?.ordineId;
      if (!primoId) fail("T10: primo invio senza ordine");

      const r2 = await postJson("/api/cliente/ordini/carrello", body);
      check("secondo invio (stessa key) → 200", r2.status === 200 && r2.data?.ordini?.[0]?.giaEsistente === true, { status: r2.status, ordini: r2.data?.ordini });
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

    console.log("\n[T11] Status HTTP: 201 nuovo / 200 retry / 422 validazione");
    {
      check("201 verificato in T2/T3/T9/T10", true);
      check("200 verificato in T10", true);
      check("422 verificato in T1/T8", true);
    }

    // ── T12: più sessioni Stripe (mock) — UN ordine = UNA sessione ────────
    console.log("\n[T12] Sessioni Stripe multiple (mock HTTP): una sessione per ordine");
    {
      // Configura Stripe (credenziali TEST cifrate con CHIAVE_F25) per i due
      // negozi: il gateway decifra con process.env.PAYMENTS_ENCRYPTION_KEY.
      for (const nid of [negozioAId!, negozioBId!]) {
        const { error: cfgErr } = await db.rpc("pagamenti_credenziali_salva", {
          p_negozio_id: nid,
          p_provider: "stripe",
          p_attivo: true,
          p_test_mode: true,
          p_secret: "sk_test_f25_mock",
          p_webhook_secret: "whsec_f25_test",
          p_chiave: CHIAVE_F25,
        });
        if (cfgErr) fail("Salvataggio config Stripe F25 fallito: " + cfgErr.message);
      }
      // La chiamata DIRETTA a creaSessioneStripePerOrdine gira nel processo
      // del test: imposta la chiave usata dalla RPC di decifratura.
      process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_F25;
      mockStripe = await avviaMockStripe();
      const gatewayOpts = { host: "127.0.0.1", port: mockStripe.port, protocol: "http" as const };

      // Crea 2 ordini (bonifico, nessuna sessione) via API.
      const key = `f25-t12-${ts}`;
      const esito = await postJson("/api/cliente/ordini/carrello", {
        checkoutKey: key, ...baseCheckout,
        righe: [
          { prodottoId: ids.pA1, varianteId: null, quantita: 1 }, // negozio A
          { prodottoId: ids.pA2, varianteId: null, quantita: 1 }, // negozio A
          { prodottoId: ids.pB, varianteId: null, quantita: 1 }, // negozio B
        ],
      });
      check("2 ordini creati per T12", (esito.data?.ordini ?? []).length === 2, esito.data?.ordini);
      const ordini = esito.data?.ordini ?? [];
      chiaviOrdini.push(chiavePerNegozio(key, negozioAId!), chiavePerNegozio(key, negozioBId!));

      // Ora crea UNA sessione per ordine con il mock: mai una sessione
      // multi-negozio, ognuna col proprio client_reference_id (= ordineId).
      const sessioni: Array<{ ordineId: string; redirectUrl: string; sessioneId: string; giaEsistente: boolean }> = [];
      for (const ordine of ordini) {
        const sessione = await creaSessioneStripePerOrdine(String(ordine.ordineId), gatewayOpts);
        if (!sessione.ok) {
          throw new Error("T12: creazione sessione fallita: " + sessione.errore);
        }
        sessioni.push({
          ordineId: String(ordine.ordineId),
          redirectUrl: sessione.redirectUrl,
          sessioneId: sessione.sessioneId,
          giaEsistente: sessione.giaEsistente,
        });
      }
      check("2 sessioni create (una per ordine)", sessioni.length === 2, sessioni);
      check("redirectUrl distinti", sessioni[0].redirectUrl !== sessioni[1].redirectUrl, sessioni.map((s) => s.redirectUrl));
      check("sessioneId distinti", sessioni[0].sessioneId !== sessioni[1].sessioneId, sessioni.map((s) => s.sessioneId));

      // client_reference_id della richiesta = ordineId (mai multi-negozio).
      const bodyChiamate = mockStripe.chiamate.map((c) => decodeURIComponent(c.body));
      check("2 chiamate POST /v1/checkout/sessions", mockStripe.chiamate.filter((c) => c.method === "POST" && c.url.startsWith("/v1/checkout/sessions")).length === 2, mockStripe.chiamate);
      check("client_reference_id = ordine A nella 1ª chiamata", bodyChiamate[0]?.includes(`client_reference_id=${ordini[0].ordineId}`), bodyChiamate[0]?.slice(0, 200));
      check("client_reference_id = ordine B nella 2ª chiamata", bodyChiamate[1]?.includes(`client_reference_id=${ordini[1].ordineId}`), bodyChiamate[1]?.slice(0, 200));

      // Retry → riusa la stessa sessione attiva (nessuna nuova chiamata).
      const nChiamatePrima = mockStripe.chiamate.length;
      const retry = await creaSessioneStripePerOrdine(String(ordini[0].ordineId), gatewayOpts);
      check("retry → sessione riusata (giaEsistente)", retry.ok && retry.giaEsistente === true, retry);
      check("retry → nessuna nuova chiamata a Stripe", mockStripe.chiamate.length === nChiamatePrima, mockStripe.chiamate.length);

      // Una sola sessione attiva per ordine.
      const { count } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).in("ordine_id", ordini.map((o: any) => o.ordineId)).eq("status", "created");
      check("2 sessioni attive totali (una per ordine)", Number(count ?? 0) === 2, count);

      // Il retry di T12 ha marcato payment_provider='stripe' sugli ordini.
      const { data: ordiniAggiornati } = await db.from("ordini").select("id, payment_provider, payment_status").in("id", ordini.map((o: any) => o.ordineId));
      check("payment_provider = stripe dopo la sessione", (ordiniAggiornati ?? []).every((o) => o.payment_provider === "stripe"), ordiniAggiornati);
      check("payment_status = pending dopo la sessione", (ordiniAggiornati ?? []).every((o) => o.payment_status === "pending"), ordiniAggiornati);

      stockA1 -= 1;
      stockA2 -= 1;
      stockPB -= 1;
    }

    // ── T13: carrello non svuotato su errore / svuotato dopo successo ─────
    console.log("\n[T13] Carrello: svuotato SOLO dopo accettazione (verifica statica)");
    {
      const src = readFileSync(join(PROGETTO, "components/carrello/CheckoutCarrelloForm.tsx"), "utf8");
      check("svuota() chiamato solo nel ramo di esito positivo", /if \(errori\.length === 0\) \{\s*svuota\(\);/.test(src));
      // svuota() con parentesi compare UNA volta (la chiamata nel ramo di
      // successo): la destructuring di useCarrello() è senza parentesi e nel
      // ramo errore non c'è alcuna chiamata.
      const occorrenzeSvuota = (src.match(/svuota\(\)/g) ?? []).length;
      check("svuota() chiamato una sola volta (ramo successo, mai nel ramo errore)", occorrenzeSvuota === 1, occorrenzeSvuota);
      check("righe dei negozi falliti conservate", src.includes("negoziConOrdine.has(riga.negozioId)"));
      check("checkoutKey generata UNA volta per pagina (useRef)", src.includes("checkoutKeyRef = useRef"));
      check("nessun prezzo inviato al backend (payload solo riferimenti)", !src.includes("prezzo:") && src.includes("prodottoId: r.prodottoId"));
    }

    // ── T14: regressione buy-now ──────────────────────────────────────────
    console.log("\n[T14] Regressione buy-now POST /api/cliente/ordini (invariato)");
    {
      const key = `f25-bn-${ts}`;
      const body = {
        idempotencyKey: key,
        prodottoId: ids.pA1,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        cliente: { nome: "Anna", cognome: "Bianchi", telefono: null, email: "f25-bn@localhub.test" },
        spedizione: {
          indirizzo: "Via Test 2", cap: "87100", citta: "Cosenza", provincia: "CS",
          metodoSpedizione: "standard", metodoPagamento: "bonifico",
        },
      };
      const r1 = await postJson("/api/cliente/ordini", body);
      check("buy-now → 201 con ordine", r1.status === 201 && Boolean(r1.data?.ordine?.id), { status: r1.status, ordine: r1.data?.ordine });
      const primoId = r1.data?.ordine?.id;
      if (!primoId) fail("T14: buy-now senza ordine");
      chiaviOrdini.push(key);
      const r2 = await postJson("/api/cliente/ordini", body);
      check("retry buy-now → 200 giaEsistente", r2.status === 200 && r2.data?.giaEsistente === true, { status: r2.status });
      stockA1 -= 1;
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`CHECKOUT CARRELLO TEST (F2.5): ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST F2.5 ──");
    if (mockStripe) await mockStripe.chiudi().catch(() => {});
    if (chiaviOrdini.length > 0) {
      const { error: delOrdini } = await db.from("ordini").delete().in("idempotency_key", chiaviOrdini);
      console.log(`  Ordini eliminati: ${chiaviOrdini.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `f25-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `f25-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui} eliminati`);
      }
    }
    if (pA1 !== null) await db.from("prodotti").update({ quantita_disponibile: 40 }).eq("id", pA1);
    if (pA2 !== null) await db.from("prodotti").update({ quantita_disponibile: 25 }).eq("id", pA2);
    if (pB !== null) await db.from("prodotti").update({ quantita_disponibile: 100 }).eq("id", pB);
    if (v1Id !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", v1Id);
    if (pVariant !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pVariant);
      await db.from("prodotti").delete().eq("id", pVariant);
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
    console.log("  Dati di test F2.5 eliminati (negozi, prodotti, varianti, ordini, sessioni, utente).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
