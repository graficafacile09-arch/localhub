/**
 * Test MACCHINA A STATI SPEDIZIONE — logica PURA (nessun DB, nessun browser).
 *
 * Eseguire con:
 *   npx tsx scripts/test-stato-spedizione.ts
 *
 * Copre le transizioni valide/invalide della macchina a stati spedizione
 * (specchio della RPC aggiorna_stato_spedizione, migration 20260903) e le
 * azioni disponibili per il venditore.
 */

import {
  azioneVersoStato,
  azioniSpedizioneDisponibili,
  etichettaStatoSpedizione,
  isAzioneSpedizione,
  isStatoSpedizione,
  transizioneSpedizioneConsentita,
} from "../lib/merchant/ordini-spedizioni";

let passati = 0;
let falliti = 0;
const errori: string[] = [];

function check(nome: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    passati++;
  } else {
    falliti++;
    errori.push(`✗ ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

// ── 1. Transizioni VALIDE ───────────────────────────────────────────────
check("NULL → non_affidata = OK", transizioneSpedizioneConsentita(null, "non_affidata") === true);
check("NULL → affidata = OK (Affida al corriere da base)", transizioneSpedizioneConsentita(null, "affidata") === true);
check("non_affidata → affidata = OK", transizioneSpedizioneConsentita("non_affidata", "affidata") === true);
check("affidata → in_transito = OK", transizioneSpedizioneConsentita("affidata", "in_transito") === true);
check("in_transito → consegnata = OK", transizioneSpedizioneConsentita("in_transito", "consegnata") === true);
check("affidata → problema = OK", transizioneSpedizioneConsentita("affidata", "problema") === true);
check("in_transito → problema = OK", transizioneSpedizioneConsentita("in_transito", "problema") === true);
check("problema → affidata = OK (riassegna)", transizioneSpedizioneConsentita("problema", "affidata") === true);
check("problema → in_transito = OK", transizioneSpedizioneConsentita("problema", "in_transito") === true);

// ── 2. Transizioni NON VALIDE ───────────────────────────────────────────
check("NULL → in_transito = KO (salto)", transizioneSpedizioneConsentita(null, "in_transito") === false);
check("NULL → consegnata = KO (salto)", transizioneSpedizioneConsentita(null, "consegnata") === false);
check("NULL → problema = KO", transizioneSpedizioneConsentita(null, "problema") === false);
check("non_affidata → in_transito = KO", transizioneSpedizioneConsentita("non_affidata", "in_transito") === false);
check("affidata → consegnata = KO (salto)", transizioneSpedizioneConsentita("affidata", "consegnata") === false);
check("in_transito → affidata = KO (indietro)", transizioneSpedizioneConsentita("in_transito", "affidata") === false);
check("consegnata → problema = KO (terminale)", transizioneSpedizioneConsentita("consegnata", "problema") === false);
check("consegnata → in_transito = KO (terminale)", transizioneSpedizioneConsentita("consegnata", "in_transito") === false);
check("affidata → non_affidata = KO", transizioneSpedizioneConsentita("affidata", "non_affidata") === false);

// ── 3. Validazione stato / azione ───────────────────────────────────────
check("isStatoSpedizione('affidata') = true", isStatoSpedizione("affidata") === true);
check("isStatoSpedizione('annullata') = false", isStatoSpedizione("annullata") === false);
check("isAzioneSpedizione('affida') = true", isAzioneSpedizione("affida") === true);
check("isAzioneSpedizione('annulla') = false", isAzioneSpedizione("annulla") === false);
check("azioneVersoStato('affida') = 'affidata'", azioneVersoStato("affida") === "affidata");
check("azioneVersoStato('riassegna') = 'affidata'", azioneVersoStato("riassegna") === "affidata");
check("azioneVersoStato('transito') = 'in_transito'", azioneVersoStato("transito") === "in_transito");
check("azioneVersoStato('problema') = 'problema'", azioneVersoStato("problema") === "problema");
check("azioneVersoStato('consegnata') = 'consegnata'", azioneVersoStato("consegnata") === "consegnata");

// ── 4. Azioni disponibili (venditore) ───────────────────────────────────
check("ordine pronto + NULL → [affida]",
  JSON.stringify(azioniSpedizioneDisponibili(null, "pronto").map((a) => a.azione)) === JSON.stringify(["affida"]));
check("ordine pronto + non_affidata → [affida]",
  JSON.stringify(azioniSpedizioneDisponibili("non_affidata", "pronto").map((a) => a.azione)) === JSON.stringify(["affida"]));
check("ordine in_lavorazione + NULL → [] (non pronto)",
  azioniSpedizioneDisponibili(null, "in_lavorazione").length === 0);
check("affidata → [transito, problema]",
  JSON.stringify(azioniSpedizioneDisponibili("affidata", "pronto").map((a) => a.azione)) === JSON.stringify(["transito", "problema"]));
check("in_transito → [consegnata, problema]",
  JSON.stringify(azioniSpedizioneDisponibili("in_transito", "consegnato").map((a) => a.azione)) === JSON.stringify(["consegnata", "problema"]));
check("problema → [riassegna, transito]",
  JSON.stringify(azioniSpedizioneDisponibili("problema", "consegnato").map((a) => a.azione)) === JSON.stringify(["riassegna", "transito"]));
check("consegnata → [] (terminale)", azioniSpedizioneDisponibili("consegnata", "consegnato").length === 0);
check("affida richiede tracking", azioniSpedizioneDisponibili(null, "pronto")[0]?.richiedeTracking === true);
check("riassegna richiede tracking", azioniSpedizioneDisponibili("problema", "consegnato")[0]?.richiedeTracking === true);
check("transito NON richiede tracking", azioniSpedizioneDisponibili("affidata", "pronto")[0]?.richiedeTracking === false);

// ── 5. Etichette ────────────────────────────────────────────────────────
check("etichetta(null) = null", etichettaStatoSpedizione(null) === null);
check("etichetta(consegnata) = 'Consegnata'", etichettaStatoSpedizione("consegnata") === "Consegnata");
check("etichetta(problema) = 'Problema'", etichettaStatoSpedizione("problema") === "Problema");

// ── Riepilogo ───────────────────────────────────────────────────────────
console.log(`\nTest stato spedizione: ${passati} passati, ${falliti} falliti.`);
if (errori.length > 0) {
  console.log(errori.join("\n"));
  process.exit(1);
}
