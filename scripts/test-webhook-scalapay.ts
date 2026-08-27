/**
 * TEST WEBHOOK SCALAPAY — parsing/idempotenza su payload REALE.
 *
 * Verifica la correzione di webhook-scalapay.ts + gateway-scalapay.ts
 * contro il modello dati UFFICIALE Scalapay (4 campi top-level):
 *   { totalAmount, status, orderToken, merchantReference } (+ orderDetails)
 *
 * Copertura:
 *   1.  firma valida (HMAC-SHA256 di `V1:{timestamp}:{JSON.stringify(payload)}`,
 *       secret = API key del merchant) → 200;
 *   2.  status creati/authorized/charged/refunded/expired → tutti accettati,
 *       evento registrato con event_id = SHA-256(body RAW), event_type =
 *       status, ordine_id = null (ordine inesistente: nessuna modifica);
 *   3.  stesso identico payload inviato due volte → 200 "Evento già
 *       processato." (idempotenza via UNIQUE su event_id), un solo record;
 *   4.  firma invalida / secret errato / firma mancante → 400 e ZERO
 *       operazioni DB (nessun evento registrato);
 *   5.  payload senza orderToken (firma valida) → 400 fail-closed;
 *   6.  status sconosciuto → 200, evento registrato, MAI transizioni;
 *   7.  merchantReference salvato nel payload persistito;
 *   8.  ZERO ordini / ZERO sessioni create per il negozio (nessuna modifica).
 *
 * Nessuna API key Sandbox reale: la firma è calcolata localmente con una
 * chiave di test fittizia. Nessun ordine creato nel DB. Cleanup completo.
 *
 * Uso: npx tsx scripts/test-webhook-scalapay.ts
 */
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { gestisciWebhookScalapay, identitaEventoDaPayload } from "../lib/pagamenti/webhook-scalapay";
import { GatewayScalapay } from "../lib/pagamenti/gateway-scalapay";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGETTO = join(__dirname, "..");

const CHIAVE_TEST = "chiave-webhook-scalapay-test-0001";
/** Prefisso chiave API di TEST fittizia (MAI la sandbox reale): firma i
 * webhook. Il suffisso con il timestamp la rende UNICA per esecuzione, così
 * la firma può combaciare SOLO con il negozio dell'esecuzione corrente
 * (in produzione ogni negozio ha una API key distinta). */
const SECRET_TEST = "sp_test_locale_webhook_0001";

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

/** Firma webhook Scalapay: HMAC-SHA256 hex di `V1:{timestamp}:{JSON.stringify(payload)}`. */
function firmaScalapay(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`V1:${timestamp}:${rawBody}`).digest("hex");
}

/** Header webhook completi. */
function headersWebhook(rawBody: string, timestamp: string, secret: string, firmaOverride?: string): Headers {
  return new Headers({
    "x-scalapay-hmac-v1": firmaOverride ?? firmaScalapay(rawBody, timestamp, secret),
    "x-scalapay-timestamp": timestamp,
  });
}

/** Payload webhook realistico Scalapay (modello dati ufficiale). */
function payloadRealistico(status: string, ts: number, orderTokenSuffix?: string): Record<string, unknown> {
  return {
    merchantReference: `SP-WH-${ts}`,
    totalAmount: { amount: "50.00", currency: "EUR" },
    status,
    orderToken: `TKN-WH-${orderTokenSuffix ?? ts}`,
    orderDetails: {
      orderId: `TKN-WH-${orderTokenSuffix ?? ts}`,
      paymentType: "pay-in-3",
      frequency: { number: 3, frequencyType: "MONTHLY" },
    },
  };
}

const STATUSI_SUPPORTATI = ["created", "authorized", "charged", "refunded", "expired"] as const;

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
  const timestamp = String(ts);
  // Chiave di test UNICA per esecuzione (mai la sandbox reale).
  const secretTest = `${SECRET_TEST}_${ts}`;

  let negozioId: string | null = null;

  // Pre-clean: rimuove eventuali residui di esecuzioni precedenti interrotte
  // (stesso prefisso slug), così il test è ri-eseguibile senza interferenze.
  console.log("\n[P0] Pre-clean residui di esecuzioni precedenti");
  {
    const { data: residui } = await db.from("negozi").select("id").like("slug", "whscalapay-%");
    const ids = (residui ?? []).map((r) => String(r.id));
    if (ids.length > 0) {
      await db.from("pagamenti_eventi").delete().in("negozio_id", ids);
      await db.from("negozio_pagamenti").delete().in("negozio_id", ids);
      await db.from("negozi").delete().in("id", ids);
      console.log(`  Eliminati ${ids.length} negozi demo residui (+ eventi/config).`);
    } else {
      console.log("  Nessun residuo.");
    }
  }

  try {
    // ── PARTE 1 (pura, nessun DB): GatewayScalapay.verificaFirma ─────────
    console.log("\n[P1] GATEWAY — verificaFirma su payload reale (5 statusi)");
    const gateway = new GatewayScalapay();
    const cred = { secret: secretTest, testMode: true } as const;

    for (const status of STATUSI_SUPPORTATI) {
      const payload = payloadRealistico(status, ts, status);
      const rawBody = JSON.stringify(payload);
      const res = await gateway.verificaFirma(rawBody, headersWebhook(rawBody, timestamp, secretTest), cred);
      check(`1a. ${status}: firma valida → evento riconosciuto`, res !== null, res);
      check(`1b. ${status}: eventType = status`, res?.eventType === status, res);
      check(`1c. ${status}: paymentId = orderToken top-level`, res?.paymentId === `TKN-WH-${status}`, res);
      check(
        `1d. ${status}: eventId = SHA-256 del body RAW (deterministico)`,
        res?.eventId === createHash("sha256").update(rawBody).digest("hex"),
        res
      );
    }

    // Idempotenza: stesso rawBody → stesso eventId (retry riconosciuto).
    {
      const rawBody = JSON.stringify(payloadRealistico("charged", ts, "dup"));
      const a = await gateway.verificaFirma(rawBody, headersWebhook(rawBody, timestamp, secretTest), cred);
      const b = await gateway.verificaFirma(rawBody, headersWebhook(rawBody, timestamp, secretTest), cred);
      check("2a. stesso payload due volte → stesso eventId (idempotenza)", a?.eventId === b?.eventId && a !== null && b !== null, { a: a?.eventId, b: b?.eventId });
    }

    // Fail-closed gateway:
    {
      const rawBody = JSON.stringify(payloadRealistico("charged", ts, "fail"));
      const alterato = JSON.stringify({ ...payloadRealistico("charged", ts, "fail"), totalAmount: { amount: "60.00", currency: "EUR" } });
      check("3a. body alterato → firma non valida (null)", (await gateway.verificaFirma(alterato, headersWebhook(rawBody, timestamp, secretTest), cred)) === null);
      check("3b. secret errato → null", (await gateway.verificaFirma(rawBody, headersWebhook(rawBody, timestamp, "sp_secret_sbagliato"), cred)) === null);
      check("3c. header mancanti → null", (await gateway.verificaFirma(rawBody, new Headers(), cred)) === null);
      const senzaToken = JSON.stringify({ merchantReference: "SP-WH-X", totalAmount: { amount: "50.00", currency: "EUR" }, status: "charged" });
      check("3d. payload senza orderToken → null (fail-closed)", (await gateway.verificaFirma(senzaToken, headersWebhook(senzaToken, timestamp, secretTest), cred)) === null);
    }

    // Helper puro di derivazione identità (webhook-scalapay.ts):
    {
      const payload = payloadRealistico("refunded", ts, "helper");
      const rawBody = JSON.stringify(payload);
      const identita = identitaEventoDaPayload(rawBody, payload);
      check(
        "4. identitaEventoDaPayload: eventId=sha256(rawBody), paymentId=orderToken, eventType=status",
        identita?.eventId === createHash("sha256").update(rawBody).digest("hex") &&
          identita?.paymentId === "TKN-WH-helper" &&
          identita?.eventType === "refunded",
        identita
      );
      check("4b. senza orderToken → null", identitaEventoDaPayload(rawBody, { status: "charged", merchantReference: "X" }) === null);
    }

    // ── PARTE 2 (DB, senza ordini): handler gestisciWebhookScalapay ──────
    console.log("\n[P2] HANDLER — negozio demo + config Scalapay (chiave di test locale)");
    const { data: n } = await db.from("negozi").insert({ nome: `WhScalapay-${ts}`, slug: `whscalapay-${ts}`, attivo: true, is_demo: true }).select("id").single();
    negozioId = String(n!.id);
    const cfg = await db.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId,
      p_provider: "scalapay",
      p_attivo: true,
      p_test_mode: true,
      p_secret: secretTest,
      p_chiave: CHIAVE_TEST,
    });
    if ((cfg.data as { ok?: boolean } | null)?.ok !== true) {
      fail("Config Scalapay fallita: " + JSON.stringify(cfg.error ?? cfg.data));
    }
    check("config Scalapay salvata (RPC, chiave di test locale)", true);

    /** Invia un evento direttamente al handler (nessun server dev). */
    async function inviaEvento(
      payload: Record<string, unknown>,
      opts: { secret?: string; firmaOverride?: string; senzaHeaders?: boolean } = {}
    ): Promise<{ status: number; body: string; rawBody: string; eventId: string }> {
      const rawBody = JSON.stringify(payload);
      const headers = opts.senzaHeaders ? new Headers() : headersWebhook(rawBody, timestamp, opts.secret ?? secretTest, opts.firmaOverride);
      const esito = await gestisciWebhookScalapay(rawBody, headers);
      return { status: esito.status, body: esito.body, rawBody, eventId: createHash("sha256").update(rawBody).digest("hex") };
    }

    // 5 statusi → 200, evento registrato, ordine inesistente → ordine_id null.
    console.log("\n[P2-T1] Status reali (created/authorized/charged/refunded/expired) → 200 + registrati");
    for (const status of STATUSI_SUPPORTATI) {
      const esito = await inviaEvento(payloadRealistico(status, ts, status));
      check(`T1-${status}: HTTP 200`, esito.status === 200, esito);
      const { data: evt } = await db.from("pagamenti_eventi").select("event_id, event_type, ordine_id, negozio_id, payment_id, status, payload").eq("event_id", esito.eventId).single();
      check(`T1-${status}: event_id = SHA-256(rawBody)`, evt?.event_id === esito.eventId, evt?.event_id);
      check(`T1-${status}: event_type = status`, evt?.event_type === status, evt?.event_type);
      check(`T1-${status}: ordine_id NULL (ordine inesistente, nessuna modifica)`, evt?.ordine_id === null, evt?.ordine_id);
      check(`T1-${status}: negozio_id = negozio del config`, String(evt?.negozio_id ?? "") === negozioId, evt?.negozio_id);
      check(`T1-${status}: payment_id = orderToken`, String(evt?.payment_id ?? "") === `TKN-WH-${status}`, evt?.payment_id);
      check(`T1-${status}: evento marcato processed`, evt?.status === "processed", evt?.status);
      const payloadSalvato = (evt?.payload ?? {}) as Record<string, unknown>;
      check(`T1-${status}: merchantReference persistito nel payload`, payloadSalvato?.merchantReference === `SP-WH-${ts}`, payloadSalvato?.merchantReference);
    }

    // Duplicato → idempotente.
    console.log("\n[P2-T2] Stesso identico payload due volte → duplicato riconosciuto");
    {
      const payload = payloadRealistico("charged", ts, "dup2");
      const primo = await inviaEvento(payload);
      check("T2a. primo invio → 200", primo.status === 200, primo);
      const secondo = await inviaEvento(payload);
      check("T2b. secondo invio (stesso body) → 200 'Evento già processato.'", secondo.status === 200 && secondo.body === "Evento già processato.", secondo);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", primo.eventId);
      check("T2c. un SOLO record per lo stesso event_id", Number(count ?? 0) === 1, count);
    }

    // Firma invalida/mancante/secret errato → 400, zero operazioni DB.
    console.log("\n[P2-T3] Firma invalida/mancante/secret errato → 400, ZERO operazioni DB");
    {
      const payload = payloadRealistico("charged", ts, "badsig");
      const rawBody = JSON.stringify(payload);
      const bad = await inviaEvento(payload, { firmaOverride: "firma-invalida" });
      check("T3a. firma invalida → HTTP 400", bad.status === 400, bad);
      const { count: c1 } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", createHash("sha256").update(rawBody).digest("hex"));
      check("T3b. nessun evento registrato (firma invalida)", Number(c1 ?? 0) === 0, c1);

      const noHeaders = await inviaEvento(payload, { senzaHeaders: true });
      check("T3c. firma mancante → HTTP 400", noHeaders.status === 400, noHeaders);

      const wrongSecret = await inviaEvento(payload, { secret: "sp_secret_sbagliato" });
      check("T3d. secret errato → HTTP 400", wrongSecret.status === 400, wrongSecret);
      const { count: c2 } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", createHash("sha256").update(rawBody).digest("hex"));
      check("T3e. ancora zero eventi (tutte le firme fallite)", Number(c2 ?? 0) === 0, c2);
    }

    // Payload senza orderToken (firma valida) → 400 fail-closed.
    console.log("\n[P2-T4] Payload senza orderToken (firma valida) → 400");
    {
      const senzaToken = { merchantReference: `SP-WH-${ts}`, totalAmount: { amount: "50.00", currency: "EUR" }, status: "charged" };
      const rawBody = JSON.stringify(senzaToken);
      const esito = await inviaEvento(senzaToken);
      check("T4a. HTTP 400 fail-closed", esito.status === 400, esito);
      const { count } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("event_id", createHash("sha256").update(rawBody).digest("hex"));
      check("T4b. nessun evento registrato", Number(count ?? 0) === 0, count);
    }

    // Status sconosciuto → 200, registrato, mai transizioni.
    console.log("\n[P2-T5] Status sconosciuto → registrato ma MAI transizioni");
    {
      const payload = payloadRealistico("status_mai_visto", ts, "unknown");
      const esito = await inviaEvento(payload);
      check("T5a. HTTP 200 (registrato)", esito.status === 200, esito);
      const { data: evt } = await db.from("pagamenti_eventi").select("event_type, status").eq("event_id", esito.eventId).single();
      check("T5b. event_type = status grezzo", evt?.event_type === "status_mai_visto", evt?.event_type);
      check("T5c. marcato processed (nessun errore)", evt?.status === "processed", evt?.status);
    }

    // Nessuna modifica: zero ordini e zero sessioni per il negozio.
    console.log("\n[P2-T6] Nessuna modifica applicativa (zero ordini / sessioni)");
    {
      const { count: ordini } = await db.from("ordini").select("id", { count: "exact", head: true }).eq("negozio_id", negozioId);
      check("T6a. ZERO ordini creati", Number(ordini ?? 0) === 0, ordini);
      const { count: sessioni } = await db.from("pagamenti_sessioni").select("id", { count: "exact", head: true }).eq("negozio_id", negozioId);
      check("T6b. ZERO sessioni create", Number(sessioni ?? 0) === 0, sessioni);
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`WEBHOOK SCALAPAY TEST: ${passati} passati, ${falliti} falliti`);
    if (falliti > 0) {
      console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("TUTTI I TEST PASSATI ✓");
  } finally {
    // ── CLEANUP COMPLETO (con verifica errori) ───────────────────────────
    console.log("\n── CLEANUP TEST WEBHOOK SCALAPAY ──");
    if (negozioId) {
      const { count: eventi } = await db.from("pagamenti_eventi").select("id", { count: "exact", head: true }).eq("negozio_id", negozioId);
      if (Number(eventi ?? 0) > 0) {
        const { error: errE } = await db.from("pagamenti_eventi").delete().eq("negozio_id", negozioId);
        if (errE) console.error("  ! errore cleanup eventi:", errE.message);
      }
      const { error: errC } = await db.from("negozio_pagamenti").delete().eq("negozio_id", negozioId);
      if (errC) console.error("  ! errore cleanup config:", errC.message);
      const { error: errN } = await db.from("negozi").delete().eq("id", negozioId);
      if (errN) console.error("  ! errore cleanup negozio:", errN.message);
      console.log(`  Eventi webhook eliminati: ${eventi ?? 0}; negozio demo + config eliminati.`);
    }
  }
}

main().catch((e) => {
  console.error("Errore durante l'esecuzione del test:", e);
  process.exit(1);
});
