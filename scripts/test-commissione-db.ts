/**
 * TEST COMMISSIONE PIATTAFORMA — INTEGRAZIONE DB (RPC crea_ordine).
 *
 * Richiede la migration 20260904 applicata al DB remoto.
 * Crea negozio + prodotto + ordine TEMPORANEI, verifica:
 *   D) snapshot commissione salvato sull'ordine alla creazione (10%);
 *   H) webhook/macchina pagamento NON altera la commissione (aggiorna_payment_status);
 *   I) gli ordini storici restano NULL su commissione_*;
 * poi pulisce tutto (self-cleaning).
 *
 * Uso: npx tsx scripts/test-commissione-db.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let passati = 0;
let falliti = 0;

function check(label: string, cond: boolean, dettaglio?: unknown) {
  if (cond) {
    passati++;
    console.log(`  ✅ ${label}`);
  } else {
    falliti++;
    console.log(`  ❌ ${label}${dettaglio !== undefined ? ` — ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function uguali(a: number | null, b: number): boolean {
  return a !== null && Math.abs(a - b) < 0.001;
}

async function main() {
  const ts = Date.now();
  let negozioId = "";
  let prodottoId = "";
  let ordineId = "";

  try {
    // ── Setup negozio + prodotto temporanei ─────────────────────────────
    const { data: n, error: errN } = await db
      .from("negozi")
      .insert({ nome: `CommPiattaforma-${ts}`, slug: `comm-piattaforma-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errN || !n) throw new Error("Setup negozio fallito: " + (errN?.message ?? "no data"));
    negozioId = String(n.id);

    const { data: p, error: errP } = await db
      .from("prodotti")
      .insert({
        negozio_id: negozioId,
        nome: `Prodotto Comm-${ts}`,
        slug: `prodotto-comm-${ts}`,
        prezzo: 12.5,
        quantita_disponibile: 50,
        attivo: true,
        ha_varianti: false,
      })
      .select("id")
      .single();
    if (errP || !p) throw new Error("Setup prodotto fallito: " + (errP?.message ?? "no data"));
    prodottoId = String(p.id);

    // ── I) storico: nessun ordine con commissione prima di questo test ──
    {
      const { data: pre } = await db
        .from("ordini")
        .select("id")
        .not("commissione_importo", "is", null);
      check("I) 0 ordini con commissione prima del test (storici NULL)", (pre ?? []).length === 0, pre?.length);
    }

    // ── D) crea_ordine → snapshot commissione salvata ───────────────────
    const key = `comm-test-${ts}`;
    const payload = {
      idempotencyKey: key,
      prodottoId,
      quantita: 2,
      modalita: "ritiro",
      clienteNome: "Mario",
      clienteCognome: "Commissione",
      clienteTelefono: null,
      clienteEmail: null,
      clienteIp: "127.0.0.1",
      ritiroData: null,
      ritiroFascia: null,
      note: null,
    };
    const { data: esito, error: rpcErr } = await db.rpc("crea_ordine", { p_payload: payload });
    if (rpcErr || !esito || esito.ok !== true) {
      throw new Error("crea_ordine fallita: " + (rpcErr?.message ?? JSON.stringify(esito)));
    }
    const ordineJson = (esito.ordine ?? {}) as { id?: string };
    ordineId = String(ordineJson.id ?? "");
    if (!ordineId) throw new Error("ordineId mancante dalla RPC");

    const { data: ordine } = await db
      .from("ordini")
      .select("id, totale, commissione_percentuale, commissione_importo, payment_status")
      .eq("id", ordineId)
      .single();

    const totale = Number(ordine?.totale ?? 0); // 12.50 × 2 = 25.00
    const pct = ordine?.commissione_percentuale;
    const importo = ordine?.commissione_importo;
    check("D) totale ordine = 25.00", uguali(totale, 25.0), totale);
    check("D) commissione_percentuale = 10.00", uguali(Number(pct), 10.0), pct);
    check("D) commissione_importo = 2.50 (25 × 10%)", uguali(Number(importo), 2.5), importo);
    check("D) commissione ≤ totale", Number(importo) <= totale);
    check("D) payment_status NULL (nessun pagamento ancora)", (ordine?.payment_status ?? null) === null);

    // Idempotenza: stesso payload → stesso ordine (nessun doppio snapshot).
    const { data: esito2 } = await db.rpc("crea_ordine", { p_payload: payload });
    check("D) idempotenza: retry restituisce lo stesso ordine", esito2?.giaEsistente === true);

    // ── H) aggiorna_payment_status (webhook) NON tocca la commissione ───
    // Ordine legacy (payment_status NULL) → prima init a pending, poi paid
    // (stesso pattern fail-safe dei webhook: STATO_LEGACY_DA_INIZIALIZZARE).
    const initRes = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "pending",
      p_payment_id: "pi_test_comm",
      p_transaction_id: null,
      p_importo: totale,
      p_valuta: "EUR",
      p_expires_at: null,
    });
    check("H) init stato pagamento a pending", initRes.error === null && initRes.data?.ok === true, initRes.error?.message);
    const { data: pagEsito, error: pagErr } = await db.rpc("aggiorna_payment_status", {
      p_ordine_id: ordineId,
      p_nuovo_stato: "paid",
      p_payment_id: "pi_test_comm",
      p_transaction_id: "pi_test_comm",
      p_importo: totale,
      p_valuta: "EUR",
      p_expires_at: null,
    });
    check("H) ordine pagato (paid)", !pagErr && pagEsito?.ok === true, pagErr?.message);
    const { data: dopo } = await db
      .from("ordini")
      .select("commissione_percentuale, commissione_importo, payment_status")
      .eq("id", ordineId)
      .single();
    check("H) commissione_importo invariata dopo il pagamento", uguali(Number(dopo?.commissione_importo), 2.5), dopo?.commissione_importo);
    check("H) commissione_percentuale invariata", uguali(Number(dopo?.commissione_percentuale), 10.0));
    check("H) payment_status = paid", dopo?.payment_status === "paid");

    // ── I) ancora: gli altri ordini restano NULL ────────────────────────
    {
      const { data: conComm } = await db
        .from("ordini")
        .select("id")
        .not("commissione_importo", "is", null)
        .neq("id", ordineId);
      check("I) nessun altro ordine con commissione (solo questo test)", (conComm ?? []).length === 0, conComm?.length);
    }
  } finally {
    // ── Cleanup (self-cleaning) ─────────────────────────────────────────
    if (ordineId) await db.from("ordini").delete().eq("id", ordineId);
    if (prodottoId) await db.from("prodotti").delete().eq("id", prodottoId);
    if (negozioId) await db.from("negozi").delete().eq("id", negozioId);
  }

  console.log(`\nCommissione DB: ${passati} passati, ${falliti} falliti.`);
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
