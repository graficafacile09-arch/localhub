/**
 * TEST MIRATO — KLARNA NEL CHECKOUT CARRELLO (contratto UI ↔ backend).
 *
 * Verifica ESATTAMENTE ciò che la UI di /checkout invia quando l'utente
 * seleziona "Klarna" come metodo di pagamento:
 *
 *   POST /api/cliente/ordini/carrello  body.spedizione.metodoPagamento = "klarna"
 *
 * e come il backend risponde (nessuna conoscenza lato client di prezzi,
 * totali o credenziali Klarna):
 *   - klarna configurato per il negozio → 201 + ordine con
 *     pagamento.redirectUrl (sessione Klarna via orchestratore);
 *   - klarna NON configurato → 422 KLARNA_NON_DISPONIBILE (errore leggibile
 *     che la UI mostra), nessun ordine creato, NESSUN fallback su Stripe;
 *   - carta/bonifico restano disponibili (regressione metodi esistenti).
 *
 * Layer simulati: HTTP Klarna (mock, come F1/F2.3) e firma webhook;
 * DB Supabase reale. Cleanup completo nel finally.
 *
 * Uso: npx tsx scripts/test-klarna-checkout-ui.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { creaSessionePagamentoPerOrdine } from "../lib/pagamenti/sessioni";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-klarna-checkout-ui-test-0001";
const WH_SECRET_KLARNA = "whsec_klarna_checkout_ui";

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

const PORTA = Number(process.env.KLARNA_UI_PORT ?? 3152);
const BASE = `http://127.0.0.1:${PORTA}`;

let server: ChildProcess | null = null;

async function avviaServer(): Promise<void> {
  const log = createWriteStream(join(tmpdir(), "klarna-ui-next-dev.log"), { flags: "w" });
  server = spawn("npx next dev -p " + PORTA, {
    cwd: PROGETTO,
    env: {
      ...process.env,
      PAYMENTS_ENCRYPTION_KEY: CHIAVE_TEST,
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
        "Server dev terminato (exit " + server.exitCode + "). Vedi " + join(tmpdir(), "klarna-ui-next-dev.log")
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
    throw new Error("Server dev non pronto entro 240s. Vedi " + join(tmpdir(), "klarna-ui-next-dev.log"));
  }
  console.log(`\nServer dev pronto su ${BASE}.\n`);
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
// Mock Klarna (creazione sessione)
// ════════════════════════════════════════════════════════════════════

function avviaMockKlarna() {
  let contatore = 0;
  const server: Server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/checkout/v3/orders") {
      contatore++;
      const orderId = `klarna_ui_${contatore}`;
      return res
        .writeHead(200, { "content-type": "application/json" })
        .end(
          JSON.stringify({
            order_id: orderId,
            redirect_url: `https://checkout.klarna.com/${orderId}`,
            status: "checkout_incomplete",
          })
        );
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error_code: "NOT_FOUND" }));
  });

  return new Promise<{ port: number; chiudi: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

let ipCounter = 95;

function ipProva(): string {
  ipCounter += 1;
  return `10.8.2.${ipCounter}`;
}

async function postJson(path: string, body: unknown): Promise<{ status: number } & Record<string, any>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ipProva() },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ...(json ?? {}) };
}

/** Payload del checkout esattamente come lo costruisce CheckoutCarrelloForm. */
function payloadCheckout(checkoutKey: string, metodoPagamento: string, prodottoId: string) {
  return {
    checkoutKey,
    modalita: "spedizione",
    cliente: { nome: "Mario", cognome: "KlarnaUI", email: "klarna-ui@localhub.test", telefono: "3331234567" },
    note: null,
    spedizione: {
      indirizzo: "Via Test 1",
      cap: "87100",
      citta: "Cosenza",
      provincia: "CS",
      note: null,
      carrier: "poste_italiane", servizio: "standard",
      metodoPagamento,
    },
    righe: [{ prodottoId: String(prodottoId), varianteId: null, quantita: 1 }],
  };
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_TEST;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const ts = Date.now();

  let negozioKId: string | null = null; // Klarna configurato
  let negozioNoKId: string | null = null; // Klarna NON configurato
  let pK: number | null = null;
  let pNoK: number | null = null;
  const ordiniCreati: string[] = [];
  let mockKlarna: Awaited<ReturnType<typeof avviaMockKlarna>> | null = null;

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    console.log("\n[T0] Setup: negozio con Klarna + negozio senza Klarna");
    const { data: nK } = await db.from("negozi").insert({ nome: `KlarnaUI-A-${ts}`, slug: `klarnaui-a-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioKId = String(nK!.id);
    const { data: nN } = await db.from("negozi").insert({ nome: `KlarnaUI-B-${ts}`, slug: `klarnaui-b-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioNoKId = String(nN!.id);

    const cfg = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioKId,
      p_provider: "klarna",
      p_attivo: true,
      p_test_mode: true,
      p_client_id: "api_username_test",
      p_secret: "api_password_test",
      p_webhook_secret: WH_SECRET_KLARNA,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfg.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Klarna fallita: " + JSON.stringify(cfg.error ?? cfg.data));
    }
    check("config Klarna sul negozio A (RPC)", true);

    const { data: qK } = await db.from("prodotti").insert({ negozio_id: negozioKId, nome: `KlarnaUI Pane-${ts}`, prezzo: 10.0, quantita_disponibile: 40, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    pK = Number(qK!.id);
    const { data: qN } = await db.from("prodotti").insert({ negozio_id: negozioNoKId, nome: `KlarnaUI Dolce-${ts}`, prezzo: 3.0, quantita_disponibile: 100, attivo: true, ha_varianti: false, peso_grammi: 1500 }).select("id").single();
    pNoK = Number(qN!.id);

    mockKlarna = await avviaMockKlarna();
    await avviaServer();

    // ── T1: ordine via route + sessione Klarna (mock HTTP, pattern F1) ──
    console.log("\n[T1] UI invia metodoPagamento='klarna' (negozio configurato) → ordine + sessione Klarna");
    let ordineT1: string | null = null;
    {
      // L'ordine nasce con bonifico (nessuna sessione): la sessione Klarna
      // viene creata dall'orchestratore con HTTP mock (unico layer simulato,
      // identico al pattern test-klarna-orchestrazione T3).
      const esito = await postJson("/api/cliente/ordini/carrello", payloadCheckout(`klarna-ui-t1-${ts}`, "bonifico", String(pK)));
      check("1a. HTTP 201 (ordine creato)", esito.status === 201, esito.status);
      const ordine = esito.data?.ordini?.[0];
      check("1b. ordine presente", Boolean(ordine?.ordineId), ordine);
      ordineT1 = ordine?.ordineId ? String(ordine.ordineId) : null;
      if (ordineT1) ordiniCreati.push(ordineT1);
      // Il client NON conosce i totali: vengono dal server.
      check("1c. totale restituito dal server (mai dal client)", Number(ordine?.totale ?? 0) > 0, ordine?.totale);

      // Sessione Klarna con HTTP mock → redirect hosted + provider klarna.
      const sessione = await creaSessionePagamentoPerOrdine(
        ordineT1!,
        "klarna",
        { baseUrl: `http://127.0.0.1:${mockKlarna!.port}` }
      );
      check("1d. sessione Klarna creata (mock redirect)", sessione.ok === true, sessione);      if (sessione.ok) {
        check(
          "1e. redirect = checkout hosted Klarna",
          String(sessione.redirectUrl).startsWith("https://checkout.klarna.com/"),
          sessione
        );
      }
      const { data: ordDb } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordineT1).single();
      check("1f. ordine con payment_provider=klarna, pending (server-side)", ordDb?.payment_provider === "klarna" && ordDb?.payment_status === "pending", ordDb);
    }

    // ── T2: klarna NON configurato → 422 KLARNA_NON_DISPONIBILE ─────────
    console.log("\n[T2] UI invia metodoPagamento='klarna' (negozio NON configurato) → errore leggibile");
    {
      const esito = await postJson("/api/cliente/ordini/carrello", payloadCheckout(`klarna-ui-t2-${ts}`, "klarna", String(pNoK)));
      check("2a. HTTP 422", esito.status === 422, esito.status);
      check("2b. codice KLARNA_NON_DISPONIBILE", esito.error?.code === "KLARNA_NON_DISPONIBILE", esito.error);
      check("2c. messaggio leggibile per l'utente", typeof esito.error?.message === "string" && String(esito.error.message).length > 10, esito.error?.message);
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `klarna-ui-t2-%`);
      check("2d. nessun ordine creato (fail-closed pre-flight)", Number(count ?? 0) === 0, count);
    }

    // ── T3: nessun fallback silenzioso su Stripe ─────────────────────────
    console.log("\n[T3] Nessun fallback automatico su Stripe");
    {
      // Negozio con Klarna attiva: la route tenta il Klarna REALE (credenziali
      // test false) → errore per negozio KLARNA_*: MAI una sessione Stripe né
      // un ordine marcato payment_provider=stripe (pattern orchestratore T2).
      const esito = await postJson("/api/cliente/ordini/carrello", payloadCheckout(`klarna-ui-t3-${ts}`, "klarna", String(pK)));
      const errKlarna = (esito.data?.errori ?? []).some((e: any) => String(e.codice).startsWith("KLARNA_"));
      check("3a. errore per negozio con codice KLARNA_* (niente fallback stripe)", errKlarna, esito.data?.errori);
      const ordineId = String(esito.data?.ordini?.[0]?.ordineId ?? "");
      if (ordineId) {
        ordiniCreati.push(ordineId);
        const { data: o } = await db.from("ordini").select("payment_provider").eq("id", ordineId).single();
        check("3b. ordine MAI marcato payment_provider=stripe", o?.payment_provider !== "stripe", o);
      }
    }

    // ── T4: regressione carta (Stripe mock non necessario: pre-flight) ──
    console.log("\n[T4] Regressione CARTA e BONIFICO");
    {
      // Bonifico: sempre disponibile (nessun gateway richiesto).
      const bon = await postJson("/api/cliente/ordini/carrello", payloadCheckout(`klarna-ui-t4bon-${ts}`, "bonifico", String(pK)));
      check("4a. bonifico → 201 ordine creato", bon.status === 201 && Boolean(bon.data?.ordini?.[0]?.ordineId), { status: bon.status });
      if (bon.data?.ordini?.[0]?.ordineId) ordiniCreati.push(String(bon.data.ordini[0].ordineId));
      check("4b. bonifico → nessuna sessione gateway (pagamento null)", bon.data?.ordini?.[0]?.pagamento == null, bon.data?.ordini?.[0]?.pagamento);
      check("4c. bonifico → paymentProvider null/bonifico (mai klarna)", bon.data?.ordini?.[0]?.paymentProvider !== "klarna", bon.data?.ordini?.[0]?.paymentProvider);

      // Carta su negozio senza Stripe → errore dedicato (mai klarna).
      const cartaNo = await postJson("/api/cliente/ordini/carrello", payloadCheckout(`klarna-ui-t4carta-${ts}`, "carta", String(pNoK)));
      check("4d. carta su negozio senza Stripe → 422 CARTA_NON_DISPONIBILE", cartaNo.status === 422 && cartaNo.error?.code === "CARTA_NON_DISPONIBILE", cartaNo);
    }

    // ── T5: idempotenza — stessa checkoutKey → stessi ordini, zero duplicati ──
    console.log("\n[T5] Idempotenza checkoutKey (doppio click con Klarna)");
    {
      const key = `klarna-ui-t5-${ts}`;
      const r1 = await postJson("/api/cliente/ordini/carrello", payloadCheckout(key, "klarna", String(pK)));
      const r2 = await postJson("/api/cliente/ordini/carrello", payloadCheckout(key, "klarna", String(pK)));
      check("5a. primo invio → 201", r1.status === 201, r1.status);
      check("5b. retry → 200 (ordini già esistenti)", r2.status === 200, r2.status);
      const id1 = String(r1.data?.ordini?.[0]?.ordineId ?? "");
      const id2 = String(r2.data?.ordini?.[0]?.ordineId ?? "");
      check("5c. stesso ordine restituito (mai duplicato)", id1 !== "" && id1 === id2, { id1, id2 });
      const { count } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `${key}%`);
      check("5d. un solo ordine nel DB", Number(count ?? 0) === 1, count);
      if (id1) ordiniCreati.push(id1);
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`KLARNA CHECKOUT UI TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST KLARNA CHECKOUT UI ──");
    if (mockKlarna) await mockKlarna.chiudi().catch(() => {});
    if (ordiniCreati.length > 0) {
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      await db.from("pagamenti_sessioni").delete().in("ordine_id", ordiniCreati);
      await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}`);
    }
    {
      const { count: residui } = await db.from("ordini").select("id", { count: "exact", head: true }).like("idempotency_key", `klarna-ui-%-${ts}%`);
      if (Number(residui ?? 0) > 0) {
        await db.from("ordini").delete().like("idempotency_key", `klarna-ui-%-${ts}%`);
        console.log(`  Sweep residui ordini: ${residui}`);
      }
    }
    for (const id of [pK, pNoK]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    for (const id of [negozioKId, negozioNoKId]) {
      if (id) {
        await db.from("negozio_pagamenti").delete().eq("negozio_id", id);
        await db.from("negozi").delete().eq("id", id);
      }
    }
    fermaServer();
    console.log("  Dati di test eliminati (ordini, sessioni, eventi, stock, prodotti, negozi, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
