/**
 * Test MOTORE TARIFFARIO SPEDIZIONI — logica PURA (nessun DB, nessun browser).
 *
 * Eseguire con:
 *   node --experimental-strip-types scripts/test-tariffe-spedizione.ts
 *
 * Copre:
 *   1. le tariffe UFFICIALI Poste Italiane (Standard/Express) e BRT (online)
 *      sui casi richiesti dalla specifica (0-1kg, 1-2kg, 0-2kg, 2-5kg, ...);
 *   2. i limiti di fascia (peso 0/negativo, oltre l'ultima fascia → null);
 *   3. il modello corrieri/servizi: BRT NON ha un servizio "express", Poste
 *      ha standard+express, il corriere locale NON ha tariffa di sistema;
 *   4. la validazione carrier/servizio (coerente con la RPC).
 *
 * SICUREZZA (documentata, garantita STRUTTURALMENTE):
 *   - il preventivo accetta SOLO prodottoId + quantità (il tipo RigaPreventivo
 *     non ha alcun campo prezzo): nessun `shipping_price` può arrivare dal
 *     browser;
 *   - le RPC crea_ordine/crea_ordine_carrello (migrazione 20260831) ricalcolano
 *     il costo ESCLUSIVAMENTE dalle tariffe del DB e dal peso del catalogo,
 *     ignorando qualunque prezzo inviato dal client.
 */

import {
  CATALOGO_SPEDIZIONE,
  TARIFFE_BRT_ONLINE,
  TARIFFE_GLS_STANDARD,
  TARIFFE_POSTE_EXPRESS,
  TARIFFE_POSTE_STANDARD,
  chiaveServizio,
  fascePerCorriere,
  isCarrierCodice,
  isServizioValidoPerCarrier,
  nessunServizioAttivo,
  trovaFascia,
} from "../lib/spedizioni/catalogo.ts";

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

function prezzo(peso: number, fasce: readonly { pesoMinG: number; pesoMaxG: number; prezzo: number }[]) {
  const f = trovaFascia(peso, fasce);
  return f ? f.prezzo : null;
}

// ── 1. Tariffe ufficiali (casi richiesti) ──────────────────────────────
check("Poste Standard 0-1 kg (500g) = €5,65", prezzo(500, TARIFFE_POSTE_STANDARD) === 5.65);
check("Poste Express 0-1 kg (500g) = €6,65", prezzo(500, TARIFFE_POSTE_EXPRESS) === 6.65);
check("Poste Standard 1-2 kg (1500g) = €5,90", prezzo(1500, TARIFFE_POSTE_STANDARD) === 5.9);
check("Poste Express 1-2 kg (1500g) = €6,90", prezzo(1500, TARIFFE_POSTE_EXPRESS) === 6.9);
check("BRT 0-2 kg (1000g) = €13,89", prezzo(1000, TARIFFE_BRT_ONLINE) === 13.89);
check("BRT 2-5 kg (3000g) = €15,75", prezzo(3000, TARIFFE_BRT_ONLINE) === 15.75);
check("GLS 0-2 kg (1000g) = €9,90", prezzo(1000, TARIFFE_GLS_STANDARD) === 9.9);
check("GLS 2-5 kg (3000g) = €11,90", prezzo(3000, TARIFFE_GLS_STANDARD) === 11.9);
check("GLS 5-10 kg (7000g) = €14,90", prezzo(7000, TARIFFE_GLS_STANDARD) === 14.9);
check("GLS 10-20 kg (15000g) = €19,90", prezzo(15000, TARIFFE_GLS_STANDARD) === 19.9);

// ── 2. Limiti di fascia ────────────────────────────────────────────────
check("Poste Standard 1000g (limite fascia 0-1kg) = €5,65", prezzo(1000, TARIFFE_POSTE_STANDARD) === 5.65);
check("Poste Standard 1001g (prima fascia 1-2kg) = €5,90", prezzo(1001, TARIFFE_POSTE_STANDARD) === 5.9);
check("Poste Standard 50-70kg (60000g) = €39,70", prezzo(60000, TARIFFE_POSTE_STANDARD) === 39.7);
check("Poste Standard oltre 70kg (70001g) → nessuna tariffa", prezzo(70001, TARIFFE_POSTE_STANDARD) === null);
check("BRT 20-31,5kg (30000g) = €25,98", prezzo(30000, TARIFFE_BRT_ONLINE) === 25.98);
check("BRT oltre 31,5kg (31501g) → nessuna tariffa", prezzo(31501, TARIFFE_BRT_ONLINE) === null);
check("GLS 2000g (limite fascia 0-2kg) = €9,90", prezzo(2000, TARIFFE_GLS_STANDARD) === 9.9);
check("GLS 2001g (fascia 2-5kg) = €11,90", prezzo(2001, TARIFFE_GLS_STANDARD) === 11.9);
check("GLS oltre 20kg (20001g) → nessuna tariffa", prezzo(20001, TARIFFE_GLS_STANDARD) === null);
check("Peso 0 → nessuna tariffa", prezzo(0, TARIFFE_POSTE_STANDARD) === null);
check("Peso negativo → nessuna tariffa", prezzo(-1, TARIFFE_POSTE_STANDARD) === null);

// ── 3. Modello corrieri/servizi ────────────────────────────────────────
check("BRT NON offre un servizio 'express' (fasce → null)", fascePerCorriere("brt", "express") === null);
check("BRT offre il servizio 'online'", fascePerCorriere("brt", "online") !== null);
check("GLS offre il servizio 'standard'", fascePerCorriere("gls", "standard") !== null);
check("GLS NON offre un servizio 'express' (fasce → null)", fascePerCorriere("gls", "express") === null);
check("Corriere locale NON ha tariffa di sistema", fascePerCorriere("locale", "locale") === null);

const voceBrt = CATALOGO_SPEDIZIONE.filter((v) => v.carrier === "brt");
check("Catalogo: BRT ha esattamente 1 servizio (online, tier standard)",
  voceBrt.length === 1 && voceBrt[0].servizio === "online" && voceBrt[0].tier === "standard");

const vocePoste = CATALOGO_SPEDIZIONE.filter((v) => v.carrier === "poste_italiane");
check("Catalogo: Poste Italiane ha standard + express",
  vocePoste.some((v) => v.servizio === "standard") && vocePoste.some((v) => v.servizio === "express"));

const voceLocale = CATALOGO_SPEDIZIONE.find((v) => v.carrier === "locale");
check("Catalogo: il corriere locale è presente e distinto", voceLocale?.servizio === "locale" && voceLocale?.tier === "locale");

const voceGls = CATALOGO_SPEDIZIONE.filter((v) => v.carrier === "gls");
check("Catalogo: GLS ha esattamente 1 servizio (standard, tier standard)",
  voceGls.length === 1 && voceGls[0].servizio === "standard" && voceGls[0].tier === "standard");
check("Catalogo: GLS nome visualizzato = 'GLS'", voceGls[0]?.carrierNome === "GLS");
check("Catalogo: GLS descrizione = 'Consegna nazionale GLS'", voceGls[0]?.descrizione === "Consegna nazionale GLS");

// ── 4. Validazione carrier/servizio (coerente con la RPC) ──────────────
check("isCarrierCodice('poste_italiane') = true", isCarrierCodice("poste_italiane") === true);
check("isCarrierCodice('brt') = true", isCarrierCodice("brt") === true);
check("isCarrierCodice('locale') = true", isCarrierCodice("locale") === true);
check("isCarrierCodice('gls') = true", isCarrierCodice("gls") === true);
check("isCarrierCodice('dhl') = false (non implementato)", isCarrierCodice("dhl") === false);
check("isServizioValidoPerCarrier(gls, standard) = true", isServizioValidoPerCarrier("gls", "standard") === true);
check("isServizioValidoPerCarrier(gls, express) = false", isServizioValidoPerCarrier("gls", "express") === false);
check("isServizioValidoPerCarrier(poste, standard) = true", isServizioValidoPerCarrier("poste_italiane", "standard") === true);
check("isServizioValidoPerCarrier(poste, express) = true", isServizioValidoPerCarrier("poste_italiane", "express") === true);
check("isServizioValidoPerCarrier(brt, online) = true", isServizioValidoPerCarrier("brt", "online") === true);
check("isServizioValidoPerCarrier(brt, express) = false", isServizioValidoPerCarrier("brt", "express") === false);
check("isServizioValidoPerCarrier(locale, locale) = true", isServizioValidoPerCarrier("locale", "locale") === true);

// ── 5. Metodi spedizione: chiavi e intersezione servizi attivi ────────
check("chiaveServizio(poste, standard) = 'poste_italiane:standard'",
  chiaveServizio("poste_italiane", "standard") === "poste_italiane:standard");
check("nessunServizioAttivo([]) = true (nessun negozio)", nessunServizioAttivo([]) === true);
check("nessunServizioAttivo([vuoto]) = true", nessunServizioAttivo([new Set()]) === true);
check("nessunServizioAttivo([{a}]) = false", nessunServizioAttivo([new Set(["a"])]) === false);
check("nessunServizioAttivo([{a,b},{a}]) = false (intersezione {a})",
  nessunServizioAttivo([new Set(["a", "b"]), new Set(["a"])]) === false);
check("nessunServizioAttivo([{a},{b}]) = true (intersezione vuota)",
  nessunServizioAttivo([new Set(["a"]), new Set(["b"])]) === true);

// ── Riepilogo ──────────────────────────────────────────────────────────
console.log(`\nTest tariffario spedizioni: ${passati} passati, ${falliti} falliti.`);
if (errori.length > 0) {
  console.log(errori.join("\n"));
  process.exit(1);
}
