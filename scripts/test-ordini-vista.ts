/**
 * Test VISTA ORDINI (logica pura di rendering stato → grafica).
 *
 * Verifica le regole fondamentali della "scheda ordine":
 *   - sintesiProdotti: nome prodotto singolo / "N prodotti";
 *   - configStatoOrdine: LO STATO DEL DB COMANDA LA GRAFICA — ogni stato ha
 *     una configurazione visiva distinta e l'ANNULLATO non può MAI usare la
 *     grafica di un ordine confermato (né viceversa);
 *   - il numero ordine resta l'identificativo (mai UUID).
 *
 * Esecuzione: npx tsx scripts/test-ordini-vista.ts
 */

import {
  configStatoOrdine,
  etichettaStato,
  formattaDataOraCard,
  formattaDataOraEvento,
  sintesiProdotti,
} from "../lib/cliente/ordini-format";
import type { StatoOrdine } from "../lib/cliente/types";

const STATI: StatoOrdine[] = [
  "in_preparazione",
  "confermato",
  "in_lavorazione",
  "pronto",
  "in_consegna",
  "consegnato",
  "cancellato",
];

async function main() {
  let passati = 0;
  let falliti = 0;
  const errori: string[] = [];

  function check(nome: string, condizione: boolean, dettaglio?: string) {
    if (condizione) {
      passati++;
      console.log(`  PASS ${nome}`);
    } else {
      falliti++;
      errori.push(nome);
      console.log(`  FAIL ${nome} ${dettaglio ? "— " + dettaglio : ""}`);
    }
  }

  // ── T1: sintesiProdotti ─────────────────────────────────────────────────────
  console.log("\n[T1] Sintesi prodotti accanto al numero ordine");
  check("nessun prodotto → ''", sintesiProdotti([]) === "");
  check("un prodotto → nome", sintesiProdotti([{ nomeProdotto: "Integratore Vitamina D" }]) === "Integratore Vitamina D");
  check("un prodotto con nome vuoto → ''", sintesiProdotti([{ nomeProdotto: "  " }]) === "");
  check("due prodotti → '2 prodotti'", sintesiProdotti([{ nomeProdotto: "A" }, { nomeProdotto: "B" }]) === "2 prodotti");
  check("tre prodotti → '3 prodotti'", sintesiProdotti([{ nomeProdotto: "A" }, { nomeProdotto: "B" }, { nomeProdotto: "C" }]) === "3 prodotti");

  // ── T2: etichette leggibili ─────────────────────────────────────────────────
  console.log("\n[T2] Etichette stato leggibili");
  check("in_preparazione → Nuovo", etichettaStato("in_preparazione") === "Nuovo");
  check("confermato → Confermato", etichettaStato("confermato") === "Confermato");
  check("in_lavorazione → In lavorazione", etichettaStato("in_lavorazione") === "In lavorazione");
  check("pronto → Pronto", etichettaStato("pronto") === "Pronto");
  check("consegnato → Completato", etichettaStato("consegnato") === "Completato");
  check("cancellato → Annullato", etichettaStato("cancellato") === "Annullato");

  // ── T3: configStatoOrdine — ogni stato ha banner distinto ───────────────────
  console.log("\n[T3] Config banner: ogni stato ha grafica distinta");
  const banners = STATI.map((s) => ({
    s,
    cfg: configStatoOrdine(s),
  }));
  const etichetteBanner = new Set(banners.map((b) => b.cfg.etichettaBanner));
  check("7 etichette banner distinte", etichetteBanner.size === 7, String(etichetteBanner.size));
  check(
    "7 combinazioni banner (sfondo) distinte",
    new Set(banners.map((b) => b.cfg.banner)).size === 7
  );
  check(
    "7 badge distinti",
    new Set(banners.map((b) => b.cfg.badge)).size === 7
  );

  // ── T4: stato → grafica specifica ───────────────────────────────────────────
  console.log("\n[T4] Stato DB → grafica corretta");
  const map: Record<StatoOrdine, string> = {
    in_preparazione: "ORDINE NUOVO",
    confermato: "ORDINE CONFERMATO",
    in_lavorazione: "IN LAVORAZIONE",
    pronto: "ORDINE PRONTO",
    in_consegna: "IN CONSEGNA",
    consegnato: "ORDINE COMPLETATO",
    cancellato: "ORDINE ANNULLATO",
  };
  for (const s of STATI) {
    check(`config(${s}).etichettaBanner = ${map[s]}`, configStatoOrdine(s).etichettaBanner === map[s]);
  }

  // ── T5: ANNULLATO ≠ CONFERMATO (regola chiave) ──────────────────────────────
  console.log("\n[T5] ANNULLATO non può mai avere la grafica di CONFERMATO");
  const annullato = configStatoOrdine("cancellato");
  const confermato = configStatoOrdine("confermato");
  check("annullato: emoji 🔴", annullato.emoji === "🔴");
  check("annullato: etichetta 'ORDINE ANNULLATO'", annullato.etichettaBanner === "ORDINE ANNULLATO");
  check("annullato: banner rosso", annullato.banner.includes("red"));
  check("annullato: badge rosso", annullato.badge.includes("red"));
  check("annullato: terminale", annullato.terminale === true);
  check("annullato ≠ confermato (etichetta)", annullato.etichettaBanner !== confermato.etichettaBanner);
  check("annullato ≠ confermato (banner)", annullato.banner !== confermato.banner);
  check("annullato ≠ confermato (badge)", annullato.badge !== confermato.badge);
  check("annullato ≠ confermato (emoji)", annullato.emoji !== confermato.emoji);
  check("confermato NON è rosso", !confermato.banner.includes("red"));
  // Nessun altro stato può usare il banner di annullamento.
  for (const s of STATI) {
    if (s !== "cancellato") {
      check(`config(${s}) ≠ grafica annullato`, configStatoOrdine(s).etichettaBanner !== "ORDINE ANNULLATO");
    }
  }

  // ── T6: stati terminali ─────────────────────────────────────────────────────
  console.log("\n[T6] Stati terminali (nessuna azione)");
  check("cancellato terminale", configStatoOrdine("cancellato").terminale);
  check("consegnato terminale", configStatoOrdine("consegnato").terminale);
  check("nuovo NON terminale", !configStatoOrdine("in_preparazione").terminale);
  check("confermato NON terminale", !configStatoOrdine("confermato").terminale);
  check("pronto NON terminale", !configStatoOrdine("pronto").terminale);

  // ── T7: formattaDataOraEvento ───────────────────────────────────────────────
  console.log("\n[T7] formattaDataOraEvento");
  check("ISO → GG/MM/AAAA HH:MM", /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/.test(formattaDataOraEvento("2026-08-10T10:00:00.000Z")));
  check("null → ''", formattaDataOraEvento(null) === "");
  check("valore non valido → fallback", formattaDataOraEvento("non-una-data") === "non-una-data");

  // ── T8: formattaDataOraCard (card ordini: "10/08/2026 · 18:42") ─────────────
  console.log("\n[T8] formattaDataOraCard");
  check("formato GG/MM/AAAA · HH:MM", /^\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}$/.test(formattaDataOraCard("2026-08-10T16:42:00.000Z")));
  check("separatore ' · ' presente", formattaDataOraCard("2026-08-10T16:42:00.000Z").includes(" · "));
  check("null → ''", formattaDataOraCard(null) === "");
  check("valore non valido → fallback", formattaDataOraCard("non-una-data") === "non-una-data");

  // ── Riepilogo ───────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`ORDINI VISTA TEST: ${passati} passati, ${falliti} falliti`);
  if (falliti > 0) {
    console.log(`Falliti: ${errori.join(", ")}`);
    process.exit(1);
  }
  console.log("TUTTI I TEST PASSATI ✓");
}

main().catch((err) => {
  console.error("Errore imprevisto nel test:", err);
  process.exit(1);
});
