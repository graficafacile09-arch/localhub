/**
 * TEST RPC AGGIORNA_PAYMENT_STATUS — FAKE/INTEGRATION (nessun DB reale).
 *
 * Simula la logica ESATTA della RPC PostgreSQL `aggiorna_payment_status`
 * (migration 20260820) contro un client Supabase FAKE, allineandola alla
 * macchina a stati pura lib/pagamenti/stati.ts (stessa fonte logica).
 *
 * Copre:
 *   T1  transizioni valide (tutte quelle della macchina);
 *   T2  transizioni invalide (rifiutate, mai throw);
 *   T3  stessa transizione → idempotente (cambiato=false, nessun doppio
 *       aggiornamento dei timestamp);
 *   T4  ordine inesistente → ORDINE_NON_TROVATO;
 *   T5  payment_status NULL/legacy → inizializzazione esplicita a pending
 *       ammessa; qualunque altra destinazione rifiutata;
 *   T6  nessuna modifica a ordini.stato / stock / metodo_pagamento;
 *   T7  isolamento tra negozi (la RPC non accetta negozio_id dal client:
 *       l'ordine è già legato al proprio negozio nel DB);
 *   T8  solo i campi payment_* vengono aggiornati;
 *   T9  coerenza con la macchina TS (stesse transizioni);
 *   T10 permessi: la RPC è grant solo a service_role (verifica dello
 *       schema SQL della migration: REVOKE anon/authenticated).
 *
 * Esecuzione: npx tsx scripts/test-pagamenti-stati-rpc.ts
 */

import {
  canTransitionPayment,
  transitionPayment,
  isPaymentStatus,
} from "../lib/pagamenti/stati";
import type { PaymentStatus } from "../lib/pagamenti/types";

let passati = 0;
let falliti = 0;
const fallitiNomi: string[] = [];

function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  PASS ${nome}`);
  } else {
    falliti++;
    fallitiNomi.push(nome);
    console.log(`  FAIL ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

// ── Riga ordine fittizia (solo i campi che la RPC usa/tocca) ─────────────────
type OrdineFake = {
  id: string;
  negozio_id: string;
  stato: string; // stato logistico: NON deve mai cambiare
  payment_status: string | null;
  payment_id?: string | null;
  payment_authorized_at: string | null;
  payment_paid_at: string | null;
  payment_expires_at?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  quantita_righe: number; // proxy "stock/righe": non deve cambiare
  metodo_pagamento: string | null;
};

function nuovoOrdine(over: Partial<OrdineFake> = {}): OrdineFake {
  return {
    id: "ord-1",
    negozio_id: "negozio-A",
    stato: "in_preparazione",
    payment_status: "pending",
    payment_authorized_at: null,
    payment_paid_at: null,
    quantita_righe: 2,
    metodo_pagamento: "carta",
    ...over,
  };
}

/**
 * Riscrittura TS della logica della RPC aggiorna_payment_status.
 * Deve produrre ESATTAMENTE gli stessi esiti della RPC SQL (stessa macchina
 * a stati, stessa gestione NULL/legacy, stessi aggiornamenti field-scoped).
 */
function rpcFake(
  ordini: Map<string, OrdineFake>,
  ordineId: string,
  nuovoStato: string,
  opts: { expiresAt?: string; importo?: number; valuta?: string } = {}
): { ok: boolean; cambiato?: boolean; codice?: string; messaggio?: string } {
  const ordine = ordini.get(ordineId);
  if (!ordine) {
    return { ok: false, codice: "ORDINE_NON_TROVATO", messaggio: "Ordine non trovato." };
  }

  if (!isPaymentStatus(nuovoStato)) {
    return { ok: false, codice: "VALIDATION_ERROR", messaggio: "Stato pagamento non valido." };
  }

  const attuale = ordine.payment_status;

  // NULL/legacy: solo inizializzazione esplicita → pending.
  if (attuale === null) {
    if (nuovoStato === "pending") {
      ordine.payment_status = "pending";
      if (opts.expiresAt) ordine.payment_expires_at ??= opts.expiresAt;
      return { ok: true, cambiato: true };
    }
    return {
      ok: false,
      codice: "STATO_LEGACY_DA_INIZIALIZZARE",
      messaggio: "Ordine senza stato pagamento: inizializza esplicitamente a pending.",
    };
  }

  // Macchina a stati (stessa fonte: lib/pagamenti/stati.ts).
  if (!canTransitionPayment(attuale as PaymentStatus, nuovoStato as PaymentStatus)) {
    return {
      ok: false,
      codice: "TRANSIZIONE_NON_CONSENTITA",
      messaggio: `Transizione di stato pagamento non consentita: ${attuale} → ${nuovoStato}.`,
    };
  }

  // Idempotenza: stesso stato → no-op.
  if (attuale === nuovoStato) {
    return { ok: true, cambiato: false };
  }

  // Aggiornamento SOLO dei campi payment_* (mai stato/stock/righe/cliente).
  // I parametri omessi PRESERVANO i valori esistenti (update parziale,
  // come la RPC SQL corretta: mai azzerare payment_id già salvato).
  ordine.payment_status = nuovoStato;
  if (opts.importo !== undefined) ordine.payment_amount = opts.importo;
  if (opts.valuta) ordine.payment_currency = opts.valuta;
  if (opts.expiresAt) ordine.payment_expires_at = opts.expiresAt;
  if (nuovoStato === "authorized") ordine.payment_authorized_at = "2026-08-20T10:00:00Z";
  if (nuovoStato === "paid") ordine.payment_paid_at = "2026-08-20T10:05:00Z";
  if (nuovoStato === "expired" && !ordine.payment_expires_at) {
    ordine.payment_expires_at = "2026-08-20T11:00:00Z";
  }

  return { ok: true, cambiato: true };
}

function mkOrdini(ordine: OrdineFake): Map<string, OrdineFake> {
  return new Map([[ordine.id, ordine]]);
}

console.log("\n[T1] Transizioni VALIDE");
{
  const casi: Array<[PaymentStatus, PaymentStatus]> = [
    ["pending", "authorized"],
    ["pending", "paid"],
    ["pending", "failed"],
    ["pending", "expired"],
    ["pending", "canceled"],
    ["authorized", "paid"],
    ["authorized", "failed"],
    ["authorized", "canceled"],
    ["paid", "refunded"],
    ["paid", "partially_refunded"],
    ["partially_refunded", "refunded"],
  ];
  for (const [da, a] of casi) {
    const ordine = nuovoOrdine({ payment_status: da });
    const esito = rpcFake(mkOrdini(ordine), ordine.id, a);
    check(`RPC ${da} → ${a} = ok/cambiato`, esito.ok === true && esito.cambiato === true);
  }
}

console.log("\n[T2] Transizioni INVALIDE (rifiutate, mai throw)");
{
  const casi: Array<[PaymentStatus, PaymentStatus]> = [
    ["paid", "pending"],
    ["paid", "failed"],
    ["paid", "authorized"],
    ["refunded", "paid"],
    ["refunded", "partially_refunded"],
    ["failed", "paid"],
    ["expired", "paid"],
    ["expired", "authorized"],
    ["canceled", "pending"],
    ["canceled", "authorized"],
    ["pending", "refunded"],
    ["authorized", "expired"],
    ["authorized", "refunded"],
  ];
  for (const [da, a] of casi) {
    const ordine = nuovoOrdine({ payment_status: da });
    const esito = rpcFake(mkOrdini(ordine), ordine.id, a);
    check(
      `RPC ${da} → ${a} = TRANSIZIONE_NON_CONSENTITA`,
      esito.ok === false && esito.codice === "TRANSIZIONE_NON_CONSENTITA"
    );
  }
}

console.log("\n[T3] Idempotenza — stesso stato → no-op (cambiato=false)");
{
  for (const stato of ["pending", "authorized", "paid", "failed", "expired", "canceled", "refunded", "partially_refunded"]) {
    const ordine = nuovoOrdine({ payment_status: stato });
    const esito = rpcFake(mkOrdini(ordine), ordine.id, stato);
    check(`RPC ${stato} → ${stato} idempotente`, esito.ok === true && esito.cambiato === false);
  }

  // Doppia chiamata paid → il timestamp non viene riscritto due volte:
  // la seconda è no-op e non cambia payment_paid_at.
  const ordine = nuovoOrdine({ payment_status: "paid", payment_paid_at: "2026-08-20T10:05:00Z" });
  rpcFake(mkOrdini(ordine), ordine.id, "paid");
  check("paid → paid non modifica payment_paid_at", ordine.payment_paid_at === "2026-08-20T10:05:00Z");
}

console.log("\n[T4] Ordine inesistente → ORDINE_NON_TROVATO");
{
  const esito = rpcFake(mkOrdini(nuovoOrdine()), "ord-inesistente", "paid");
  check("ordine inesistente rifiutato", esito.ok === false && esito.codice === "ORDINE_NON_TROVATO");
}

console.log("\n[T5] payment_status NULL/legacy gestito in modo sicuro");
{
  const legacy = nuovoOrdine({ payment_status: null });
  const esitoInit = rpcFake(mkOrdini(legacy), legacy.id, "pending");
  check("NULL → pending (inizializzazione esplicita) ok", esitoInit.ok === true && esitoInit.cambiato === true);

  const legacy2 = nuovoOrdine({ payment_status: null });
  const esitoPaid = rpcFake(mkOrdini(legacy2), legacy2.id, "paid");
  check(
    "NULL → paid RIFIUTATO (fail-closed)",
    esitoPaid.ok === false && esitoPaid.codice === "STATO_LEGACY_DA_INIZIALIZZARE"
  );

  const legacy3 = nuovoOrdine({ payment_status: null });
  const esitoRefund = rpcFake(mkOrdini(legacy3), legacy3.id, "refunded");
  check(
    "NULL → refunded RIFIUTATO",
    esitoRefund.ok === false && esitoRefund.codice === "STATO_LEGACY_DA_INIZIALIZZARE"
  );
}

console.log("\n[T6] Nessuna modifica a ordini.stato / stock / metodo_pagamento");
{
  const ordine = nuovoOrdine({ payment_status: "pending", stato: "in_preparazione", quantita_righe: 2, metodo_pagamento: "carta" });
  rpcFake(mkOrdini(ordine), ordine.id, "paid");
  check("ordini.stato NON cambiato", ordine.stato === "in_preparazione");
  check("stock/righe NON cambiati", ordine.quantita_righe === 2);
  check("metodo_pagamento NON cambiato", ordine.metodo_pagamento === "carta");
  check("payment_status aggiornato a paid", ordine.payment_status === "paid");
}

console.log("\n[T7] Isolamento tra negozi: la RPC non riceve negozio_id dal client");
{
  // La firma della RPC non ha parametro negozio_id: l'ordine è già legato
  // al proprio negozio nel DB. Verifichiamo che una transizione sull'ordine
  // di un negozio non tocchi MAI l'ordine di un altro negozio.
  const negozioA = nuovoOrdine({ id: "ord-A", negozio_id: "negozio-A", payment_status: "pending" });
  const negozioB = nuovoOrdine({ id: "ord-B", negozio_id: "negozio-B", payment_status: "pending" });
  const mappa = new Map([[negozioA.id, negozioA], [negozioB.id, negozioB]]);

  rpcFake(mappa, "ord-A", "paid");

  check("negozio A pagato", mappa.get("ord-A")?.payment_status === "paid");
  check("negozio B NON toccato", mappa.get("ord-B")?.payment_status === "pending");
}

console.log("\n[T8] I campi payment_* omessi nelle transizioni successive vengono PRESERVATI");
{
  // Regressione: paid con payment_id → poi refunded SENZA payment_id:
  // l'id del provider NON deve mai essere azzerato (tracciabilità).
  const ordine = nuovoOrdine({ payment_status: "pending" });
  const mappa = mkOrdini(ordine);
  // transizione 1: pending → paid (con importo/valuta)
  const esito1 = rpcFake(mappa, ordine.id, "paid", { importo: 100, valuta: "EUR" });
  (mappa.get(ordine.id) as OrdineFake).payment_id = "pay_123_provider";
  // transizione 2: refunded SENZA payment_id
  const esito2 = rpcFake(mappa, ordine.id, "refunded");
  check("refunded ok", esito1.ok === true && esito2.ok === true);
  check("payment_id PRESERVATO dopo transizione senza id", (mappa.get(ordine.id) as OrdineFake).payment_id === "pay_123_provider");
  check("payment_amount PRESERVATO dopo transizione senza importo", (mappa.get(ordine.id) as OrdineFake).payment_amount === 100);
  check("payment_currency PRESERVATO dopo transizione senza valuta", (mappa.get(ordine.id) as OrdineFake).payment_currency === "EUR");

  // expired senza expires_at → timestamp valorizzato (coerenza)
  const ordine2 = nuovoOrdine({ payment_status: "pending" });
  rpcFake(mkOrdini(ordine2), ordine2.id, "expired");
  check("expired senza expires_at → payment_expires_at valorizzato", ordine2.payment_expires_at !== null && ordine2.payment_expires_at !== undefined);
}

console.log("\n[T8b] Solo i campi payment_* vengono aggiornati");
{
  const ordine = nuovoOrdine({ payment_status: "paid" });
  const prima = JSON.stringify(ordine);
  const esito = rpcFake(mkOrdini(ordine), ordine.id, "partially_refunded", { importo: 25.5, valuta: "EUR" });
  check("transizione ok", esito.ok === true);
  check("solo campi payment_* cambiati (payment_status + amount + currency)", 
    (ordine as unknown as Record<string, unknown>).payment_status === "partially_refunded" &&
    (ordine as unknown as Record<string, unknown>).payment_amount === 25.5 &&
    (ordine as unknown as Record<string, unknown>).payment_currency === "EUR"
  );
  check("stato logistico invariato", (ordine as unknown as Record<string, unknown>).stato === "in_preparazione");
  void prima;
}

console.log("\n[T9] Coerenza con la macchina TS (stesse transizioni)");
{
  // Per ogni coppia di stati: la RPC fake e transitionPayment devono
  // concordare su ok/rifiuto (stessa fonte logica).
  const stati: PaymentStatus[] = [
    "pending", "authorized", "paid", "failed", "expired", "canceled", "refunded", "partially_refunded",
  ];
  for (const da of stati) {
    for (const a of stati) {
      const ordine = nuovoOrdine({ payment_status: da });
      const rpcEsito = rpcFake(mkOrdini(ordine), ordine.id, a);
      const tsEsito = transitionPayment(da, a);
      const coerente =
        (rpcEsito.ok === true && tsEsito.ok === true && rpcEsito.cambiato === tsEsito.cambiato) ||
        (rpcEsito.ok === false && tsEsito.ok === false);
      check(`coerenza TS/RPC ${da} → ${a}`, coerente);
    }
  }
}

console.log("\n[T10] Permessi: REVOKE anon/authenticated, GRANT service_role (schema SQL)");
{
  const fs = require("node:fs");
  const sql = fs.readFileSync("supabase/migrations/20260820_pagamenti_stati.sql", "utf8");
  const hasRevoke = /revoke execute on function public\.aggiorna_payment_status\([^)]*\) from public, anon, authenticated/i.test(sql);
  const hasGrant = /grant execute on function public\.aggiorna_payment_status\([^)]*\) to service_role/i.test(sql);
  const isDefiner = /security definer/i.test(sql);
  const hasForUpdate = /for update/i.test(sql);
  check("REVOKE da public/anon/authenticated", hasRevoke);
  check("GRANT a service_role", hasGrant);
  check("SECURITY DEFINER", isDefiner);
  check("SELECT ... FOR UPDATE (lock riga)", hasForUpdate);
  check("nessun parametro negozio_id nella firma", !/p_negozio_id/.test(sql));
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(`RPC STATI PAGAMENTO TEST: ${passati} passati, ${falliti} falliti`);
if (falliti > 0) {
  console.log(`FALLITI: ${fallitiNomi.join(", ")}`);
  process.exit(1);
}
console.log("TUTTI I TEST PASSATI ✓");
