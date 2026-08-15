/**
 * E2E TEST — GAP F1 PAYMENT_PROVIDER (verifica esplicita di 'stripe').
 *
 * Verifica END-TO-END il flusso Stripe contro il DB REALE (Supabase):
 *   1. ordine REALE creato via RPC `crea_ordine` (stock decrementato);
 *   2. sessione Stripe creata via la VERA funzione di produzione
 *      `creaSessioneStripePerOrdine` (lib/pagamenti/sessioni.ts);
 *   3. [ASSERT PRINCIPALE] ordini.payment_provider = 'stripe' sul DB reale;
 *   4. webhook REALE `checkout.session.completed` processato via la VERA
 *      funzione `gestisciWebhookStripe` (firma verificata) → paid;
 *   5. payment_provider resta 'stripe' dopo la transizione pending → paid;
 *   6. CLEANUP COMPLETO: config negozio ripristinata byte-for-byte, stock
 *      ripristinato, ordine/sessione/eventi di test eliminati.
 *
 * NOTA sulla "realtà": le credenziali Stripe sono write-only su Vercel
 * (PAYMENTS_ENCRYPTION_KEY è [SENSITIVE] e non decifrabile localmente),
 * quindi il solo layer simulato è il SERVER HTTP Stripe (mock locale,
 * identico al pattern ufficiale di scripts/test-pagamenti-f1.ts). Tutto il
 * resto — DB, RPC, orchestratore sessioni, webhook, macchina a stati — è
 * quello di produzione contro il DB reale.
 *
 * Uso: npx tsx scripts/test-e2e-stripe-provider.ts
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

// Chiave TEST locale per cifrare/decifrare i secret del negozio E2E durante
// il test (mai quella reale di Vercel). La config originale viene ripristinata.
const CHIAVE_E2E = "chiave-e2e-stripe-provider-test-0001";

// Negozio di test: Panificio Rossi (demo, attivo, servizi spedizione già
// attivi, pacco 1500g configurato dalla migration 20260907). Prodotto:
// "Pane Casereccio 1,5 kg" (id 2, prezzo 3.50, stock 9).
const NEGOZIO_E2E = "f3a82af7-dd47-482f-8a49-ea58e692238c";
const PRODOTTO_E2E = "2"; // "Pane Casereccio 1,5 kg" (prezzo 3.50)

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

/** Server HTTP locale che simula le route Stripe usate dal gateway. */
function avviaMockStripe(): Promise<{
  port: number;
  chiudi: () => Promise<void>;
}> {
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += String(c)));
    req.on("end", () => {
      const rispondi = (data: unknown, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (req.method === "POST" && (req.url ?? "").startsWith("/v1/checkout/sessions")) {
        return rispondi({
          id: "cs_test_e2e_provider",
          url: "https://checkout.stripe.com/c/pay/cs_test_e2e_provider",
          status: "open",
          payment_status: "unpaid",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          client_reference_id: "",
          metadata: {},
        });
      }
      if (req.method === "GET" && (req.url ?? "").includes("/v1/checkout/sessions/")) {
        return rispondi({
          id: "cs_test_e2e_provider",
          status: "complete",
          payment_status: "paid",
          payment_intent: "pi_test_e2e_provider",
        });
      }
      rispondi({}, 404);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, chiudi: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function main() {
  loadEnv();
  process.env.PAYMENTS_ENCRYPTION_KEY = CHIAVE_E2E;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 0. Backup config Stripe del negozio E2E (ripristino byte-for-byte;
  //    se il negozio NON ha una config preesistente, nel cleanup la riga
  //    di TEST viene eliminata per tornare allo stato originario) ──────────
  let configOrig: Record<string, unknown> | null = null;
  const { data: configPre } = await db
    .from("negozio_pagamenti")
    .select("*")
    .eq("negozio_id", NEGOZIO_E2E)
    .eq("provider", "stripe");
  if ((configPre ?? []).length > 0) {
    configOrig = (configPre ?? [])[0] as Record<string, unknown>;
    console.log(`\nConfig Stripe E2E salvata (backup): id=${String(configOrig?.id)}`);
  } else {
    console.log(`\nNessuna config Stripe preesistente per il negozio E2E: la config di TEST verrà eliminata nel cleanup.`);
  }

  // Ordine di test (idempotency unica) e righe pulite dopo il run.
  const idempotencyKey = `e2e-provider-${Date.now()}`;
  let ordineId: string | null = null;
  let sessioneId: string | null = null;
  let stockPre: number | null = null;
  let paccoPre: number | null = null;
  let paccoImpostato = false;

  // Dopo il salvataggio della config TEST, QUALSIASI errore va propagato
  // con throw (NON process.exit): il blocco finally DEVE sempre eseguire
  // il ripristino della config originale del negozio.
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  try {
    // ── 1. Config TEST sul negozio E2E (secret mock cifrati con CHIAVE_E2E) ──
    const { error: saveErr } = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: NEGOZIO_E2E,
      p_provider: "stripe",
      p_attivo: true,
      p_test_mode: true,
      p_secret: "sk_test_e2e_mock_provider",
      p_webhook_secret: "whsec_e2e_test_provider",
      p_chiave: CHIAVE_E2E,
    });
    if (saveErr) {
      console.error("Salvataggio config TEST fallito:", saveErr.message);
      fail("Salvataggio config TEST fallito: " + saveErr.message);
    }
    console.log("\nConfig TEST Stripe salvata sul negozio E2E (verrà ripristinata).");

    // ── 2. Ordine REALE via RPC crea_ordine (stesso payload del checkout) ──
    const { data: rigaProdotto, error: pErr } = await db
      .from("prodotti")
      .select("id, prezzo, quantita_disponibile, peso_grammi")
      .eq("id", Number(PRODOTTO_E2E))
      .single();
    if (pErr || !rigaProdotto) {
      fail("Prodotto E2E non trovato: " + (pErr?.message ?? ""));
    }
    // `fail` lancia sempre → da qui rigaProdotto è garantito non-null.
    stockPre = Number(rigaProdotto!.quantita_disponibile ?? 0);
    void (rigaProdotto as Record<string, unknown>).peso_grammi; // (compatibilità lettura riga prodotto)

    // MOTORE TARIFFARIO (modello pacco 20260901): Poste/BRT richiedono
    // negozi.pacco_peso_grammi > 0 (non più prodotti.peso_grammi). Valore
    // temporaneo 1500 (coerente con la migration 20260907), ripristinato
    // nel cleanup. Poste Standard 1-2 kg → 5,90 € → totale 3,50 + 5,90 = 9,40.
    const { data: negozioPre } = await db
      .from("negozi")
      .select("pacco_peso_grammi")
      .eq("id", NEGOZIO_E2E)
      .single();
    paccoPre =
      negozioPre && negozioPre.pacco_peso_grammi != null
        ? Number(negozioPre.pacco_peso_grammi)
        : null;
    const { error: paccoErr } = await db
      .from("negozi")
      .update({ pacco_peso_grammi: 1500 })
      .eq("id", NEGOZIO_E2E);
    if (paccoErr) fail("Impostazione pacco di test fallita: " + paccoErr.message);
    paccoImpostato = true;

    const { data: esitoOrdine, error: oErr } = await db.rpc("crea_ordine", {
      p_payload: {
        idempotencyKey,
        prodottoId: PRODOTTO_E2E,
        varianteId: null,
        quantita: 1,
        modalita: "spedizione",
        clienteNome: "E2E",
        clienteCognome: "Provider",
        clienteTelefono: "3331234567",
        clienteEmail: "e2e-provider@localhub.test",
        clienteUserId: null,
        clienteIp: "127.0.0.1",
        ritiroData: null,
        ritiroFascia: null,
        spedizioneIndirizzo: "Via Test 1",
        spedizioneCap: "87100",
        spedizioneCitta: "Cosenza",
        spedizioneProvincia: "CS",
        spedizioneNote: null,
        spedizioneCarrier: "poste_italiane",
        spedizioneServizio: "standard",
        metodoPagamento: "carta",
        note: null,
      },
    });
    const esitoOrd = (esitoOrdine ?? null) as {
      ok?: boolean;
      ordine?: { id?: string } | null;
      codice?: string;
      messaggio?: string;
    } | null;
    check(
      "crea_ordine RPC ok",
      !oErr && esitoOrd?.ok === true && Boolean(esitoOrd?.ordine?.id),
      { error: oErr?.message, esito: esitoOrd }
    );
    if (!oErr && esitoOrd?.ok === true && esitoOrd.ordine?.id) {
      ordineId = String(esitoOrd.ordine.id);
    }
    if (!ordineId) fail("crea_ordine non ha restituito un ordine");
    // `fail` lancia sempre → da qui ordineId è garantito non-null.
    const ordineIdTest = ordineId!;
    void idempotencyKey;

    const { data: ordine0 } = await db
      .from("ordini")
      .select("payment_status, payment_provider")
      .eq("id", ordineIdTest)
      .single();
    check(
      "ordine appena creato: payment_status NULL (attesa) e provider NULL",
      ordine0?.payment_status == null && ordine0?.payment_provider == null,
      ordine0
    );

    // ── 3. Sessione Stripe con la VERA funzione di produzione ─────────────
    const mock = await avviaMockStripe();
    const esito = await creaSessioneStripePerOrdine(ordineIdTest, {
      host: "127.0.0.1",
      port: mock.port,
      protocol: "http",
    });
    check("creaSessioneStripePerOrdine ok + redirectUrl", esito.ok === true && "redirectUrl" in esito, esito);
    if (esito.ok) sessioneId = esito.sessioneId;

    // ── 4. [ASSERT PRINCIPALE] payment_provider = 'stripe' sul DB reale ────
    const { data: ordine1 } = await db
      .from("ordini")
      .select("id, payment_status, payment_provider, payment_id, payment_expires_at")
      .eq("id", ordineIdTest)
      .single();
    console.log("\n── ASSERT PRINCIPALE (DB reale) ──");
    check("payment_provider = 'stripe'", ordine1?.payment_provider === "stripe", ordine1);
    check("payment_status = 'pending'", ordine1?.payment_status === "pending", ordine1);
    check(
      "payment_id valorizzato (cs_test_e2e_provider)",
      String(ordine1?.payment_id ?? "") === "cs_test_e2e_provider",
      ordine1
    );
    check("payment_expires_at valorizzato", Boolean(ordine1?.payment_expires_at), ordine1);

    const { data: sessioneDb } = await db
      .from("pagamenti_sessioni")
      .select("provider, status, payment_id")
      .eq("ordine_id", ordineIdTest)
      .single();
    check(
      "pagamenti_sessioni: provider='stripe' status='created'",
      sessioneDb?.provider === "stripe" && sessioneDb?.status === "created",
      sessioneDb
    );

    // ── 5. Webhook REALE checkout.session.completed → paid ────────────────
    const payloadWebhook = JSON.stringify({
      id: "evt_e2e_provider_completed",
      object: "event",
      api_version: "2024-06-20",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_e2e_provider",
          client_reference_id: ordineIdTest,
          metadata: { ordine_id: ordineIdTest, negozio_id: NEGOZIO_E2E },
          payment_status: "paid",
          amount_total: 940, // 3,50 + 5,90 spedizione Poste Standard 1-2kg
          currency: "eur",
          payment_intent: "pi_test_e2e_provider",
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: payloadWebhook,
      secret: "whsec_e2e_test_provider",
    });
    const esitoWebhook = await gestisciWebhookStripe(
      payloadWebhook,
      new Headers({ "stripe-signature": header })
    );
    check("webhook completed → HTTP 200", esitoWebhook.status === 200, esitoWebhook);

    const { data: ordine2 } = await db
      .from("ordini")
      .select("payment_status, payment_provider, payment_transaction_id, payment_paid_at")
      .eq("id", ordineIdTest)
      .single();
    check("dopo webhook: payment_status = 'paid'", ordine2?.payment_status === "paid", ordine2);
    check(
      "payment_provider RESTA 'stripe' dopo pending → paid",
      ordine2?.payment_provider === "stripe",
      ordine2
    );
    check(
      "payment_transaction_id = pi_test_e2e_provider",
      ordine2?.payment_transaction_id === "pi_test_e2e_provider",
      ordine2
    );

    const { data: sessioneDb2 } = await db
      .from("pagamenti_sessioni")
      .select("status")
      .eq("ordine_id", ordineIdTest)
      .single();
    check("sessione → status 'paid'", sessioneDb2?.status === "paid", sessioneDb2);

    await mock.chiudi();
  } finally {
    // ── 6. CLEANUP COMPLETO ───────────────────────────────────────────────
    console.log("\n── CLEANUP TEST ──");
    if (ordineId) {
      // Eventi webhook con ordine_id FK (on delete set null): li eliminiamo.
      await db.from("pagamenti_eventi").delete().eq("ordine_id", ordineId);
      // Sessione (cascade con l'ordine) e ordine.
      await db.from("ordini").delete().eq("id", ordineId);
      console.log(`  Ordine di test eliminato: ${ordineId}`);
    } else if (sessioneId) {
      await db.from("pagamenti_sessioni").delete().eq("id", sessioneId);
    }
    if (ordineId && stockPre !== null) {
      // Ripristino dello stock decrementato dalla creazione ordine di test.
      const { error: stockErr } = await db
        .from("prodotti")
        .update({ quantita_disponibile: stockPre })
        .eq("id", Number(PRODOTTO_E2E));
      console.log(`  Stock prodotto ${PRODOTTO_E2E} ripristinato a ${stockPre}${stockErr ? " (ERRORE: " + stockErr.message + ")" : ""}`);
    }
    if (paccoImpostato) {
      // Ripristino del pacco del negozio di test (motore tariffario).
      const { error: paccoErr } = await db
        .from("negozi")
        .update({ pacco_peso_grammi: paccoPre })
        .eq("id", NEGOZIO_E2E);
      console.log(`  Pacco negozio E2E ripristinato a ${paccoPre ?? "null"}${paccoErr ? " (ERRORE: " + paccoErr.message + ")" : ""}`);
    }
    if (configOrig) {
      // Config Stripe ORIGINALE ripristinata byte-for-byte.
      const { error: restoreErr } = await db
        .from("negozio_pagamenti")
        .update({
          attivo: configOrig.attivo,
          test_mode: configOrig.test_mode,
          client_id: configOrig.client_id,
          secret_encrypted: configOrig.secret_encrypted,
          webhook_secret_encrypted: configOrig.webhook_secret_encrypted,
          payee_email: configOrig.payee_email,
          iban: configOrig.iban,
        })
        .eq("id", String(configOrig.id));
      console.log(`  Config Stripe negozio E2E ripristinata (${restoreErr ? "ERRORE: " + restoreErr.message : "byte-for-byte"})`);
    } else {
      // Nessuna config preesistente: elimina la riga di TEST (stato originario).
      const { error: delErr } = await db
        .from("negozio_pagamenti")
        .delete()
        .eq("negozio_id", NEGOZIO_E2E)
        .eq("provider", "stripe");
      console.log(`  Config Stripe di TEST eliminata (${delErr ? "ERRORE: " + delErr.message : "stato originario ripristinato"})`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`E2E STRIPE PROVIDER TEST: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) {
    console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
    process.exit(1);
  }
  console.log("TUTTI I TEST PASSATI ✓");
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
