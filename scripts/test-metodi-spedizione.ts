/**
 * Test INTEGRAZIONE — METODI DI SPEDIZIONE PER NEGOZIO (fail-closed).
 *
 * Crea un negozio + prodotto TEMPORANEI, verifica il motore tariffario
 * (getPreventivoSpedizione) e la RPC calcola_tariffa_spedizione, poi pulisce
 * tutto (self-cleaning, nessun dato persistente).
 *
 * Copre i casi richiesti:
 *   A) negozio senza servizi → tutti non disponibili;
 *   B) solo Poste Standard attivo → solo Standard selezionabile;
 *   C) Standard + Express → entrambi selezionabili;
 *   D) BRT disattivo → BRT grigio (motivo "non attivato");
 *   E) pacco non configurato → Poste/BRT non disponibili;
 *   F) locale attivo senza costo locale → locale non disponibile;
 *   G) prezzo motore = prezzo RPC.
 *
 * Uso: npx tsx scripts/test-metodi-spedizione.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getPreventivoSpedizione } from "../lib/spedizioni/motore";

// ── Carica .env.local (stesso pattern dei test esistenti) ──────────────
try {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL || !KEY) {
  console.error("Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(2);
}

const db = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passati = 0;
let falliti = 0;
function check(nome: string, condizione: boolean, dettaglio?: unknown) {
  if (condizione) {
    passati++;
    console.log(`  ✅ ${nome}`);
  } else {
    falliti++;
    console.log(`  ❌ ${nome}${dettaglio !== undefined ? ` → ${JSON.stringify(dettaglio)}` : ""}`);
  }
}

function opzione(preventivo: { opzioni: Array<{ carrier: string; servizio: string; disponibile: boolean; motivo: string | null; prezzo: number | null; gratuita: boolean }> }, carrier: string, servizio: string) {
  return preventivo.opzioni.find((o) => o.carrier === carrier && o.servizio === servizio) ?? null;
}

async function setMetodi(
  negozioId: string,
  metodi: Array<{ carrier: string; servizio: string; attivo: boolean; spedizione_gratuita?: boolean }>
) {
  await db.from("negozio_metodi_spedizione").delete().eq("negozio_id", negozioId);
  if (metodi.length > 0) {
    await db.from("negozio_metodi_spedizione").insert(
      metodi.map((m, i) => ({
        negozio_id: negozioId,
        ...m,
        spedizione_gratuita: m.spedizione_gratuita === true,
        ordine_mostra: i,
      }))
    );
  }
}

async function setPacco(negozioId: string, grammi: number | null) {
  await db.from("negozi").update({ pacco_peso_grammi: grammi }).eq("id", negozioId);
}

async function main() {
  const ts = Date.now();
  let negozioId = "";
  let prodottoId = "";

  try {
    // ── Setup negozio + prodotto temporanei ─────────────────────────────
    const { data: n, error: errN } = await db
      .from("negozi")
      .insert({ nome: `MetodiSped-${ts}`, slug: `metodi-sped-${ts}`, attivo: true, is_demo: true })
      .select("id")
      .single();
    if (errN || !n) throw new Error("Setup negozio fallito: " + (errN?.message ?? "no data"));
    negozioId = String(n.id);

    const { data: p, error: errP } = await db
      .from("prodotti")
      .insert({
        negozio_id: negozioId,
        nome: `Prodotto Sped-${ts}`,
        slug: `prodotto-sped-${ts}`,
        prezzo: 10.0,
        quantita_disponibile: 50,
        attivo: true,
        ha_varianti: false,
      })
      .select("id")
      .single();
    if (errP || !p) throw new Error("Setup prodotto fallito: " + (errP?.message ?? "no data"));
    prodottoId = String(p.id);

    // ── A) nessun servizio attivo → tutti non disponibili ───────────────
    await setMetodi(negozioId, []);
    await setPacco(negozioId, 1200);
    const a = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("A) nessun servizio attivo → nessunServizioAttivo=true", a.ok && a.nessunServizioAttivo === true);
    check("A) tutte le opzioni non disponibili", a.ok && a.opzioni.every((o) => o.disponibile === false));

    // ── B) solo Poste Standard attivo ───────────────────────────────────
    await setMetodi(negozioId, [{ carrier: "poste_italiane", servizio: "standard", attivo: true }]);
    const b = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("B) Poste Standard selezionabile", opzione(b, "poste_italiane", "standard")?.disponibile === true);
    check("B) Poste Express NON selezionabile", opzione(b, "poste_italiane", "express")?.disponibile === false);
    check("B) BRT NON selezionabile", opzione(b, "brt", "online")?.disponibile === false);

    // ── C) Standard + Express attivi ────────────────────────────────────
    await setMetodi(negozioId, [
      { carrier: "poste_italiane", servizio: "standard", attivo: true },
      { carrier: "poste_italiane", servizio: "express", attivo: true },
    ]);
    const c = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("C) Poste Standard selezionabile", opzione(c, "poste_italiane", "standard")?.disponibile === true);
    check("C) Poste Express selezionabile", opzione(c, "poste_italiane", "express")?.disponibile === true);
    check("C) BRT NON selezionabile", opzione(c, "brt", "online")?.disponibile === false);

    // ── D) BRT disattivo → grigio con motivo "non attivato" ─────────────
    const dBrt = opzione(c, "brt", "online");
    check("D) BRT motivo 'Servizio non attivato dal negozio.'", dBrt?.motivo === "Servizio non attivato dal negozio.", dBrt?.motivo);

    // ── E) pacco non configurato → Poste/BRT non disponibili ────────────
    await setMetodi(negozioId, [
      { carrier: "poste_italiane", servizio: "standard", attivo: true },
      { carrier: "brt", servizio: "online", attivo: true },
    ]);
    await setPacco(negozioId, null);
    const e = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("E) Poste Standard NON selezionabile (pacco mancante)", opzione(e, "poste_italiane", "standard")?.disponibile === false);
    check("E) BRT NON selezionabile (pacco mancante)", opzione(e, "brt", "online")?.disponibile === false);
    check("E) motivo pacco non configurato", opzione(e, "poste_italiane", "standard")?.motivo === "Pacco non configurato dal negozio.");

    // ── F) locale attivo senza costo locale → locale non disponibile ────
    await setPacco(negozioId, 1200);
    await setMetodi(negozioId, [{ carrier: "locale", servizio: "locale", attivo: true }]);
    const f = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("F) locale NON selezionabile (costo locale assente)", opzione(f, "locale", "locale")?.disponibile === false);
    check("F) locale motivo non configurato", opzione(f, "locale", "locale")?.motivo === "Corriere locale non configurato per uno o più prodotti del carrello.");

    // ── G) prezzo motore = prezzo RPC ───────────────────────────────────
    await setMetodi(negozioId, [{ carrier: "poste_italiane", servizio: "standard", attivo: true }]);
    const g = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    const prezzoMotore = opzione(g, "poste_italiane", "standard")?.prezzo ?? null;
    const { data: rpcData } = await db.rpc("calcola_tariffa_spedizione", {
      p_carrier: "poste_italiane",
      p_service: "standard",
      p_peso_grammi: 1200,
    });
    const prezzoRpc = (rpcData as { prezzo?: number } | null)?.prezzo ?? null;
    check("G) prezzo motore = prezzo RPC (€5,90)", prezzoMotore === prezzoRpc && prezzoMotore === 5.9, { prezzoMotore, prezzoRpc });

    // ── H) GLS attivo: tariffa per fascia ──────────────────────────────
    await setPacco(negozioId, 3000);
    await setMetodi(negozioId, [{ carrier: "gls", servizio: "standard", attivo: true }]);
    const h = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("H) GLS selezionabile", opzione(h, "gls", "standard")?.disponibile === true);
    check("H) GLS 3kg = €11,90", opzione(h, "gls", "standard")?.prezzo === 11.9, opzione(h, "gls", "standard")?.prezzo);
    check("H) GLS non gratuita", opzione(h, "gls", "standard")?.gratuita === false);
    const { data: rpcGls } = await db.rpc("calcola_tariffa_spedizione", {
      p_carrier: "gls",
      p_service: "standard",
      p_peso_grammi: 3000,
    });
    check("H) RPC GLS 3kg = €11,90", (rpcGls as { prezzo?: number } | null)?.prezzo === 11.9, rpcGls);

    // ── I) GLS gratuito: prezzo 0, flag gratuita, senza pacco ──────────
    await setPacco(negozioId, null);
    await setMetodi(negozioId, [
      { carrier: "gls", servizio: "standard", attivo: true, spedizione_gratuita: true },
    ]);
    const i = await getPreventivoSpedizione([{ prodottoId, quantita: 1 }]);
    check("I) GLS gratuito selezionabile (anche senza pacco)", opzione(i, "gls", "standard")?.disponibile === true);
    check("I) GLS gratuito prezzo = 0", opzione(i, "gls", "standard")?.prezzo === 0, opzione(i, "gls", "standard")?.prezzo);
    check("I) GLS gratuito flag gratuita = true", opzione(i, "gls", "standard")?.gratuita === true);
  } catch (err) {
    falliti++;
    console.error("  ❌ ERRORE nel test:", err instanceof Error ? err.message : String(err));
  } finally {
    // ── Cleanup (self-cleaning) ─────────────────────────────────────────
    if (prodottoId) {
      await db.from("prodotti").delete().eq("id", prodottoId);
    }
    if (negozioId) {
      await db.from("negozio_metodi_spedizione").delete().eq("negozio_id", negozioId);
      await db.from("negozi").delete().eq("id", negozioId);
    }
  }

  console.log(`\nTest metodi spedizione: ${passati} passati, ${falliti} falliti.`);
  if (falliti > 0) process.exit(1);
}

main();
