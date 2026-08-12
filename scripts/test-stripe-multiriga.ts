/**
 * F2.3 TEST — STRIPE MULTI-RIGA (line item per ordini_righe, DB REALE).
 *
 * Verifica contro il Supabase REALE che una Checkout Session Stripe
 * rappresenti TUTTE le ordini_righe dell'ordine (un line_item per riga,
 * con prezzo unitario/quantità dagli snapshot DB e variante nel nome) e
 * che il totale della sessione coincida con ordine.totale (inclusa la
 * spedizione, una sola volta). Unico layer simulato: il server HTTP
 * Stripe (mock locale, pattern ufficiale test-pagamenti-f1.ts) che
 * CATTURA il body della richiesta per le verifiche. DB, RPC, orchestratore
 * (creaSessioneStripePerOrdine) e webhook (gestisciWebhookStripe) sono
 * quelli di produzione.
 *
 *   T1  ordine MULTI-RIGA (crea_ordine_carrello, spedizione express, mix
 *       legacy+variante) → 4 line item (3 prodotti + spedizione), quantità,
 *       prezzi centesimi = prezzi DB, nome variante, totale = ordine.totale;
 *   T2  ordine MONO-RIGA legacy buy-now (crea_ordine, spedizione standard)
 *       → 2 line item (prodotto + spedizione), totale = ordine.totale;
 *   T3  retry → STESSA sessione attiva (giaEsistente), una sola per ordine;
 *   T4  webhook reale checkout.session.completed → paid, provider resta
 *       'stripe', transaction valorizzata, sessione paid, evento idempotente;
 *   T5  scadenza (pagamenti_ordine_scaduto) → ripristino stock di TUTTE le
 *       righe + ordine annullato;
 *   T6  nessun prezzo dal client: i line item catturati coincidono con gli
 *       snapshot ordini_righe (prezzo unitario e quantità).
 *
 * Cleanup completo nel finally (ordini, eventi, stock, varianti, prodotti,
 * negozio, config Stripe di test). Uso: npx tsx scripts/test-stripe-multiriga.ts
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { creaSessioneStripePerOrdine } from "../lib/pagamenti/sessioni";
import { gestisciWebhookStripe } from "../lib/pagamenti/webhook-stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

/** Chiave TEST locale per cifrare/decifrare la config Stripe del negozio F23. */
const CHIAVE_F23 = "chiave-f23-stripe-multiriga-test-0001";

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
// Mock Stripe (cattura il body di POST /v1/checkout/sessions)
// ════════════════════════════════════════════════════════════════════

function avviaMockStripe(): Promise<{
  port: number;
  body: () => string;
  numeroChiamate: () => number;
  chiudi: () => Promise<void>;
}> {
  let bodyCatturato = "";
  let contatoreChiamate = 0;
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        contatoreChiamate += 1;
        bodyCatturato = body;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "cs_test_multiriga_f23",
            url: "https://checkout.stripe.com/c/pay/cs_test_multiriga_f23",
            status: "open",
            payment_status: "unpaid",
            expires_at: Math.floor(Date.now() / 1000) + 1800,
            client_reference_id: "",
            metadata: {},
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        body: () => bodyCatturato,
        numeroChiamate: () => contatoreChiamate,
        chiudi: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Parser del body form-urlencoded dell'SDK Stripe
// ════════════════════════════════════════════════════════════════════

function parseFormUrlencoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const coppia of body.split("&")) {
    const eq = coppia.indexOf("=");
    if (eq < 0) continue;
    const k = decodeURIComponent(coppia.slice(0, eq).replace(/\+/g, "%20"));
    const v = decodeURIComponent(coppia.slice(eq + 1).replace(/\+/g, "%20"));
    out[k] = v;
  }
  return out;
}

type LineItemCatturato = { quantity: number; unitAmount: number; currency: string; name: string };

/** Estrae i line item dal body (line_items[0][price_data][unit_amount]=...). */
function lineItemsDaBody(body: string): LineItemCatturato[] {
  const campi = parseFormUrlencoded(body);
  const mappa = new Map<number, LineItemCatturato>();
  for (const [k, v] of Object.entries(campi)) {
    const m = k.match(/^line_items\[(\d+)\]\[(.*)\]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const campo = m[2];
    const riga = mappa.get(idx) ?? { quantity: 0, unitAmount: 0, currency: "", name: "" };
    if (campo === "quantity") riga.quantity = Number(v);
    else if (campo === "price_data][unit_amount") riga.unitAmount = Number(v);
    else if (campo === "price_data][currency") riga.currency = v;
    else if (campo === "price_data][product_data][name") riga.name = v;
    mappa.set(idx, riga);
  }
  return [...mappa.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

type PayloadCarrello = {
  idempotencyKey: string;
  modalita: "ritiro" | "spedizione";
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  clienteUserId: string | null;
  clienteIp: string;
  spedizioneIndirizzo?: string | null;
  spedizioneCap?: string | null;
  spedizioneCitta?: string | null;
  spedizioneProvincia?: string | null;
  metodoSpedizione?: string | null;
  metodoPagamento?: string | null;
  righe: { prodottoId: string; varianteId?: string | null; quantita: number }[];
};

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_F23;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = Date.now();

  // ── Dati di test: negozio dedicato + prodotti (legacy e con varianti) ──
  let negozioId: string | null = null;
  let p1: number | null = null;    // 10.00, stock 20
  let p2: number | null = null;    // 20.50, stock 15
  let pV: number | null = null;    // ha_varianti (padre)
  let vM: string | null = null;    // 6.00, stock 10
  let vL: string | null = null;    // 5.50, stock 8

  const ordiniCreati: string[] = [];
  let mock: Awaited<ReturnType<typeof avviaMockStripe>> | null = null;

  try {
    const { data: negozio, error: errNeg } = await db
      .from("negozi")
      .insert({ nome: `F23-Store-${ts}`, slug: `f23-store-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errNeg || !negozio?.id) fail("Creazione negozio F23 fallita: " + (errNeg?.message ?? ""));
    negozioId = String(negozio!.id);

    const { data: r1 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioId, nome: `F23-ProdottoLegacy1-${ts}`, prezzo: 10.0, quantita_disponibile: 20, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    p1 = Number(r1!.id);
    const { data: r2 } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioId, nome: `F23-ProdottoLegacy2-${ts}`, prezzo: 20.5, quantita_disponibile: 15, attivo: true, ha_varianti: false })
      .select("id")
      .single();
    p2 = Number(r2!.id);
    const { data: rv } = await db
      .from("prodotti")
      .insert({ negozio_id: negozioId, nome: `F23-ProdottoVarianti-${ts}`, prezzo: 5.0, quantita_disponibile: 0, attivo: true, ha_varianti: true })
      .select("id")
      .single();
    pV = Number(rv!.id);
    const { data: v1 } = await db
      .from("prodotto_varianti")
      .insert({ prodotto_id: pV, nome: "F23-Variante M", attributi: { taglia: "M" }, prezzo: 6.0, quantita_disponibile: 10, quantita_riservata: 0, attivo: true })
      .select("id")
      .single();
    vM = String(v1!.id);
    const { data: v2 } = await db
      .from("prodotto_varianti")
      .insert({ prodotto_id: pV, nome: "F23-Variante L", attributi: { taglia: "L" }, prezzo: 5.5, quantita_disponibile: 8, quantita_riservata: 0, attivo: true })
      .select("id")
      .single();
    vL = String(v2!.id);

    // Config Stripe TEST sul negozio F23 (cifrata con CHIAVE_F23).
    const { error: cfgErr } = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_secret: "sk_test_f23_mock",
      p_webhook_secret: "whsec_f23_test",
      p_chiave: CHIAVE_F23,
    });
    if (cfgErr) fail("Salvataggio config Stripe F23 fallito: " + cfgErr.message);

    mock = await avviaMockStripe();
    const gatewayOpts = { host: "127.0.0.1", port: mock.port, protocol: "http" as const };

    // ── T1: ordine MULTI-RIGA (legacy + variante, spedizione express) ─────
    console.log("\n[T1] Ordine multi-riga → 4 line item (3 prodotti + spedizione)");
    let ordine1Totale = 0;
    let ordine1Id: string | null = null;
    {
      const payload: PayloadCarrello = {
        idempotencyKey: `f23-t1-${ts}`,
        modalita: "spedizione",
        clienteNome: "Mario",
        clienteCognome: "Rossi",
        clienteTelefono: null,
        clienteEmail: "f23-t1@localhub.test",
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via Test 1",
        spedizioneCap: "87100",
        spedizioneCitta: "Cosenza",
        spedizioneProvincia: "CS",
        metodoSpedizione: "express",
        metodoPagamento: "carta",
        righe: [
          { prodottoId: String(p1), varianteId: null, quantita: 2 },        // 10.00×2
          { prodottoId: String(p2), varianteId: null, quantita: 1 },        // 20.50×1
          { prodottoId: String(pV), varianteId: vM, quantita: 2 },          // 6.00×2
        ],
      };
      const { data, error } = await db.rpc("crea_ordine_carrello", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("crea_ordine_carrello ok", !error && esito?.ok === true && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true || !esito?.ordine?.id) fail("T1: creazione ordine fallita");
      // fail() lancia sempre → da qui esito.ordine è garantito non-null.
      const ordineJson = esito!.ordine!;
      ordine1Id = String(ordineJson.id);
      ordine1Totale = Number(ordineJson.totale);
      ordiniCreati.push(ordine1Id);
      // Totale atteso: 20 + 20.5 + 12 + 12.9 (express) = 65.40
      check("totale ordine DB = 65.40", ordine1Totale === 65.4, ordine1Totale);

      // Sessione Stripe reale (orchestratore di produzione, gateway mock)
      const sessione = await creaSessioneStripePerOrdine(ordine1Id, gatewayOpts);
      check("creaSessioneStripePerOrdine ok + redirectUrl", sessione.ok === true && "redirectUrl" in sessione, sessione);
      if (!sessione.ok) fail("T1: creazione sessione fallita: " + sessione.errore);

      const items = lineItemsDaBody(mock.body());
      check("4 line item (3 prodotti + spedizione)", items.length === 4, items);

      const rigaP1 = items.find((i) => i.unitAmount === 1000);
      check("prodotto 1: prezzo 1000 centesimi (10.00 DB) e quantità 2", rigaP1?.unitAmount === 1000 && rigaP1?.quantity === 2, rigaP1);
      const rigaP2 = items.find((i) => i.unitAmount === 2050);
      check("prodotto 2: prezzo 2050 centesimi (20.50 DB) e quantità 1", rigaP2?.unitAmount === 2050 && rigaP2?.quantity === 1, rigaP2);
      const rigaVM = items.find((i) => i.unitAmount === 600);
      check("variante M: prezzo 600 centesimi (6.00 variante, non padre) e quantità 2", rigaVM?.unitAmount === 600 && rigaVM?.quantity === 2, rigaVM);
      const rigaSped = items.find((i) => i.unitAmount === 1290);
      check("spedizione express: line item 1290 centesimi, quantità 1", rigaSped?.unitAmount === 1290 && rigaSped?.quantity === 1, rigaSped);

      check("nome prodotto 1 dallo snapshot DB", String(rigaP1?.name ?? "").startsWith("F23-ProdottoLegacy1"), rigaP1?.name);
      check("variante inclusa nel nome", String(rigaVM?.name ?? "").includes("F23-Variante M"), rigaVM?.name);
      check("valuta eur su ogni line item", items.every((i) => i.currency === "eur"), items.map((i) => i.currency));

      // Totale sessione ↔ totale ordine DB
      const totaleCentesimi = items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
      check(`totale sessione = totale ordine DB (${Math.round(ordine1Totale * 100)})`, totaleCentesimi === Math.round(ordine1Totale * 100), totaleCentesimi);

      // T6: nessun prezzo dal client — i line item coincidono con gli snapshot ordini_righe
      const { data: righeDb } = await db
        .from("ordini_righe")
        .select("nome_prodotto, prezzo_unitario, quantita, variante_nome")
        .eq("ordine_id", ordine1Id)
        .order("created_at", { ascending: true });
      const attesi = (righeDb ?? []).map((r: any) => ({
        prezzo: Math.round(Number(r.prezzo_unitario) * 100),
        qta: Number(r.quantita),
      }));
      // Esclude la spedizione per NOME (non per importo: robusto anche se un
      // prodotto del test costasse quanto la spedizione).
      const catturatiProdotti = items.filter((i) => i.name !== "Spedizione");
      check(
        "prezzi/quantità line item == snapshot ordini_righe (mai dal client)",
        attesi.length === catturatiProdotti.length &&
          attesi.every((a, i) => a.prezzo === catturatiProdotti[i]?.unitAmount && a.qta === catturatiProdotti[i]?.quantity),
        { attesi, catturati: catturatiProdotti }
      );

      // Stato pagamento sul DB
      const { data: ordineDb } = await db
        .from("ordini")
        .select("payment_status, payment_provider, payment_id, payment_amount, payment_expires_at")
        .eq("id", ordine1Id)
        .single();
      check("payment_status = 'pending'", ordineDb?.payment_status === "pending", ordineDb);
      check("payment_provider = 'stripe'", ordineDb?.payment_provider === "stripe", ordineDb);
      check("payment_id = cs_test_multiriga_f23", ordineDb?.payment_id === "cs_test_multiriga_f23", ordineDb?.payment_id);
      check("payment_amount = totale ordine DB", Number(ordineDb?.payment_amount ?? 0) === ordine1Totale, ordineDb?.payment_amount);
      check("payment_expires_at valorizzato", Boolean(ordineDb?.payment_expires_at), ordineDb?.payment_expires_at);

      const { data: sessioneDb } = await db
        .from("pagamenti_sessioni")
        .select("provider, status, amount, payment_id")
        .eq("ordine_id", ordine1Id)
        .single();
      check("pagamenti_sessioni: provider stripe, status created, amount corretto", sessioneDb?.provider === "stripe" && sessioneDb?.status === "created" && Number(sessioneDb?.amount) === ordine1Totale, sessioneDb);
    }

    // ── T2: ordine MONO-RIGA legacy buy-now (spedizione standard) ────────
    console.log("\n[T2] Ordine mono-riga legacy (buy-now) → 2 line item (prodotto + spedizione)");
    let ordine2Totale = 0;
    let ordine2Id: string | null = null;
    {
      const payload = {
        idempotencyKey: `f23-t2-${ts}`,
        prodottoId: String(p1),
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        clienteNome: "Luigi",
        clienteCognome: "Verdi",
        clienteTelefono: null,
        clienteEmail: "f23-t2@localhub.test",
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        spedizioneIndirizzo: "Via Test 2",
        spedizioneCap: "00100",
        spedizioneCitta: "Roma",
        spedizioneProvincia: "RM",
        metodoSpedizione: "standard",
        metodoPagamento: "carta",
      };
      const { data, error } = await db.rpc("crea_ordine", { p_payload: payload });
      const esito = (data ?? null) as { ok?: boolean; ordine?: any; codice?: string; messaggio?: string } | null;
      check("crea_ordine legacy ok", !error && esito?.ok === true && Boolean(esito?.ordine?.id), { error: error?.message, esito });
      if (error || esito?.ok !== true || !esito?.ordine?.id) fail("T2: creazione ordine fallita");
      // fail() lancia sempre → da qui esito.ordine è garantito non-null.
      const ordineJson = esito!.ordine!;
      ordine2Id = String(ordineJson.id);
      ordine2Totale = Number(ordineJson.totale);
      ordiniCreati.push(ordine2Id);
      // Totale atteso: 10 + 5.9 (standard) = 15.90
      check("totale ordine DB = 15.90", ordine2Totale === 15.9, ordine2Totale);

      const sessione = await creaSessioneStripePerOrdine(ordine2Id, gatewayOpts);
      check("creaSessioneStripePerOrdine ok (mono-riga)", sessione.ok === true, sessione);

      const items = lineItemsDaBody(mock.body());
      check("2 line item (1 prodotto + spedizione standard)", items.length === 2, items);
      const rigaProd = items.find((i) => i.unitAmount === 1000);
      check("prodotto: 1000 centesimi, quantità 1", rigaProd?.unitAmount === 1000 && rigaProd?.quantity === 1, rigaProd);
      const rigaSped = items.find((i) => i.unitAmount === 590);
      check("spedizione standard: 590 centesimi", rigaSped?.unitAmount === 590 && rigaSped?.quantity === 1, rigaSped);
      const totaleCentesimi = items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
      check(`totale sessione = totale ordine DB (${ordine2Totale * 100})`, totaleCentesimi === Math.round(ordine2Totale * 100), totaleCentesimi);
    }

    // ── T3: retry → stessa sessione attiva, una sola per ordine ──────────
    console.log("\n[T3] Retry → riuso della sessione attiva (idempotenza)");
    {
      const chiamatePrima = mock.numeroChiamate(); // 2 (T1 + T2)
      const prima = await creaSessioneStripePerOrdine(ordine1Id!, gatewayOpts);
      check("retry ok + giaEsistente=true", prima.ok === true && "giaEsistente" in prima && prima.giaEsistente === true, prima);
      if (!prima.ok || !("sessioneId" in prima)) fail("T3: retry senza sessione");
      check("nessuna nuova chiamata HTTP a Stripe al retry", mock.numeroChiamate() === chiamatePrima, mock.numeroChiamate());
      const { count } = await db
        .from("pagamenti_sessioni")
        .select("id", { count: "exact", head: true })
        .eq("ordine_id", ordine1Id)
        .in("status", ["created", "pending"]);
      check("una sola sessione attiva per ordine", Number(count ?? 0) === 1, count);
      const { data: ordineDb } = await db.from("ordini").select("payment_provider, payment_status").eq("id", ordine1Id).single();
      check("payment_provider resta 'stripe' e status pending", ordineDb?.payment_provider === "stripe" && ordineDb?.payment_status === "pending", ordineDb);
    }

    // ── T4: webhook reale checkout.session.completed → paid ──────────────
    console.log("\n[T4] Webhook checkout.session.completed → paid (invariato)");
    {
      const payloadWebhook = JSON.stringify({
        id: "evt_f23_completed_1",
        object: "event",
        api_version: "2024-06-20",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_multiriga_f23",
            client_reference_id: ordine1Id,
            metadata: { ordine_id: ordine1Id, negozio_id: negozioId },
            payment_status: "paid",
            amount_total: Math.round(ordine1Totale * 100),
            currency: "eur",
            payment_intent: "pi_test_f23",
          },
        },
      });
      const header = Stripe.webhooks.generateTestHeaderString({
        payload: payloadWebhook,
        secret: "whsec_f23_test",
      });
      const esito = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook completed → HTTP 200", esito.status === 200, esito);

      const { data: ordineDb } = await db
        .from("ordini")
        .select("payment_status, payment_provider, payment_transaction_id, payment_paid_at, payment_amount")
        .eq("id", ordine1Id)
        .single();
      check("payment_status = 'paid'", ordineDb?.payment_status === "paid", ordineDb);
      check("payment_provider RESTA 'stripe'", ordineDb?.payment_provider === "stripe", ordineDb);
      check("payment_transaction_id = pi_test_f23", ordineDb?.payment_transaction_id === "pi_test_f23", ordineDb?.payment_transaction_id);
      check("payment_paid_at valorizzato", Boolean(ordineDb?.payment_paid_at), ordineDb?.payment_paid_at);
      check("payment_amount = amount_total webhook = totale DB", Number(ordineDb?.payment_amount ?? 0) === ordine1Totale, ordineDb?.payment_amount);

      const { data: sessioneDb } = await db
        .from("pagamenti_sessioni")
        .select("status")
        .eq("ordine_id", ordine1Id)
        .single();
      check("sessione → status 'paid'", sessioneDb?.status === "paid", sessioneDb);

      const { data: eventoDb } = await db
        .from("pagamenti_eventi")
        .select("event_id, status")
        .eq("event_id", "evt_f23_completed_1")
        .maybeSingle();
      check("evento registrato e processato", eventoDb?.event_id === "evt_f23_completed_1" && eventoDb?.status === "processed", eventoDb);

      // Duplicato → idempotente, non riprocessato
      const esito2 = await gestisciWebhookStripe(payloadWebhook, new Headers({ "stripe-signature": header }));
      check("webhook duplicato → 200 'già processato'", esito2.status === 200, esito2);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", "evt_f23_completed_1");
      check("un solo evento nel DB", Number(count ?? 0) === 1, count);
    }

    // ── T5: scadenza → ripristino stock di TUTTE le righe ────────────────
    console.log("\n[T5] Scadenza pagamento → ripristino stock (invariato)");
    {
      const { data: stockPre } = await db.from("prodotti").select("quantita_disponibile").eq("id", p1).single();
      const pre = Number(stockPre?.quantita_disponibile ?? 0); // 17 dopo T1(18)+T2(17)

      const { data: scaduto, error: scadErr } = await db.rpc("pagamenti_ordine_scaduto", { p_ordine_id: ordine2Id });
      const esitoScad = (scaduto ?? null) as { ok?: boolean; stato?: string } | null;
      check("pagamenti_ordine_scaduto ok (stato expired)", !scadErr && esitoScad?.ok === true && esitoScad?.stato === "expired", { error: scadErr?.message, esitoScad });

      const { data: ordineDb } = await db.from("ordini").select("stato, payment_status, annullato_motivo").eq("id", ordine2Id).single();
      check("ordine → cancellato (pagamento_scaduto)", ordineDb?.stato === "cancellato" && ordineDb?.annullato_motivo === "pagamento_scaduto", ordineDb);
      check("payment_status → expired", ordineDb?.payment_status === "expired", ordineDb?.payment_status);

      const { data: stockPost } = await db.from("prodotti").select("quantita_disponibile").eq("id", p1).single();
      check(`stock ripristinato (${pre} → ${pre + 1})`, Number(stockPost?.quantita_disponibile) === pre + 1, stockPost?.quantita_disponibile);
    }

    // ── Riepilogo ─────────────────────────────────────────────────────────
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`STRIPE MULTI-RIGA TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO ─────────────────────────────────────────────────
    console.log("\n── CLEANUP TEST F2.3 ──");
    if (ordiniCreati.length > 0) {
      // Eventi webhook (FK on delete set null) → ordini (cascade sessioni/righe)
      await db.from("pagamenti_eventi").delete().in("ordine_id", ordiniCreati);
      const { error: delOrdini } = await db.from("ordini").delete().in("id", ordiniCreati);
      console.log(`  Ordini eliminati: ${ordiniCreati.length}${delOrdini ? " (ERRORE: " + delOrdini.message + ")" : ""}`);
    }
    // Ripristino stock ai valori iniziali
    if (p1 !== null) await db.from("prodotti").update({ quantita_disponibile: 20 }).eq("id", p1);
    if (p2 !== null) await db.from("prodotti").update({ quantita_disponibile: 15 }).eq("id", p2);
    if (vM !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 10 }).eq("id", vM);
    if (vL !== null) await db.from("prodotto_varianti").update({ quantita_disponibile: 8 }).eq("id", vL);
    // Varianti → prodotti → negozio → config Stripe di test
    if (pV !== null) {
      await db.from("prodotto_varianti").delete().eq("prodotto_id", pV);
      await db.from("prodotti").delete().eq("id", pV);
    }
    for (const id of [p1, p2]) {
      if (id !== null) await db.from("prodotti").delete().eq("id", id);
    }
    if (negozioId) {
      await db.from("negozio_pagamenti").delete().eq("negozio_id", negozioId).eq("provider", "stripe");
      await db.from("negozi").delete().eq("id", negozioId);
    }
    if (mock) await mock.chiudi();
    console.log("  Dati di test F2.3 eliminati (ordini, eventi, stock, varianti, prodotti, negozio, config).");
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
