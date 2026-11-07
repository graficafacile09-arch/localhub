import assert from "node:assert/strict";
import test from "node:test";

import {
  chatConAssistente,
  filtraLuoghiPertinentiGuidaPino,
  richiestaGuidaAttrazioniPino,
} from "../lib/assistente/index.ts";
import { isAttractionNameQuery, searchAttractions } from "../lib/assistente/attrazioni.ts";
import { pianoIntentoLocale } from "../lib/assistente/local-intents.ts";
import { trovaRispostaFaqPino } from "../lib/assistente/faq.ts";
import { parseFarmacieTurno } from "../lib/farmacie-turno.ts";
import { planPinoCoreRequest } from "../lib/assistente/core-v2/request-planner.ts";
import { ATTRAZIONI_DINTORNI, ATTRAZIONI_LUOGHI } from "../lib/attrazioni-data.ts";

// ─── Precedenza degli intenti locali sul ramo Attrazioni ────────────────────
//
// Un toponimo nella frase («… a Castrovillari») non deve identificare da solo
// una guida: la richiesta «Che tempo fa oggi a Castrovillari?» finiva nel ramo
// Attrazioni, che proponeva il Castello Aragonese perché la sua descrizione
// contiene la parola «tempo». Qui si fissano tre garanzie:
//   1. meteo e farmacie hanno precedenza sul ramo Attrazioni;
//   2. eventi e ricerche commerciali non vengono dirottati sulla guida;
//   3. i toponimi e le parole generiche non identificano un luogo da soli.
//
// Nessuna rete, nessuna quota: il fetch è disattivato e Supabase è il client
// finto caricato da `tests/support/hook-pino.mjs`.

globalThis.fetch = async (url) => {
  throw new Error(`rete disattivata nei test Pino: ${String(url)}`);
};

const u = (content) => ({ role: "user", content });
const rispondi = (content) => chatConAssistente([u(content)]);

const GUIDA = /guida Attrazioni|Attractions guide/i;
const CASTELLO = /Castello Aragonese/;

// ─── 1. Meteo e farmacie: precedenza deterministica ─────────────────────────

test("«Che tempo fa oggi a Castrovillari?» è meteo e non Attrazioni", async () => {
  const frase = "Che tempo fa oggi a Castrovillari?";

  assert.deepEqual(pianoIntentoLocale(frase), { tool: "getWeather" });
  assert.equal(planPinoCoreRequest(frase).route, "weather");
  assert.equal(richiestaGuidaAttrazioniPino(frase), false);

  const r = await rispondi(frase);
  assert.doesNotMatch(r.risposta, GUIDA);
  assert.doesNotMatch(r.risposta, CASTELLO);
  assert.match(r.risposta, /meteo/i);
});

test("le farmacie con la città nel testo restano farmacie, non Attrazioni", async () => {
  for (const frase of [
    "Farmacia di turno a Castrovillari?",
    "Farmacie aperte ora a Castrovillari",
  ]) {
    const piano = pianoIntentoLocale(frase);
    assert.equal(piano?.tool, "searchPharmacies", frase);
    assert.equal(richiestaGuidaAttrazioniPino(frase), false, frase);
    assert.equal(planPinoCoreRequest(frase).route, "pharmacies", frase);
  }
});

test("la ricerca generica, al singolare o al plurale, recupera tutte le farmacie", () => {
  assert.deepEqual(pianoIntentoLocale("Cerco farmacie a Castrovillari"), {
    tool: "searchPharmacies",
    stato: "tutte",
  });
  // "farmacia" da sola è un intento locale: la fonte è il tool farmacie, non
  // il catalogo negozi (che non conosce turni e orari delle farmacie).
  assert.deepEqual(pianoIntentoLocale("farmacia"), {
    tool: "searchPharmacies",
    stato: "tutte",
  });
});

test("una richiesta naturale 'trova attrazioni' mantiene la guida ampia", () => {
  const frase = "Trova attrazioni a Castrovillari";
  assert.equal(richiestaGuidaAttrazioniPino(frase), true);
  const luoghi = searchAttractions(frase, 6);
  assert.ok(luoghi.length > 0);
  assert.equal(filtraLuoghiPertinentiGuidaPino(frase, luoghi).length, luoghi.length);
});

test("Pino recupera le risposte pubblicate nelle FAQ", () => {
  assert.match(trovaRispostaFaqPino("Come funziona InCittà?")?.risposta ?? "", /piattaforma digitale/i);
  assert.match(trovaRispostaFaqPino("Quali metodi di pagamento posso utilizzare?")?.risposta ?? "", /checkout/i);
  assert.equal(trovaRispostaFaqPino("Che tempo farà domani?"), null);
});

test("parser farmacie tollera markup con attributi riordinati", () => {
  const html = "<div class='farmacia-box' itemtype='http://schema.org/Pharmacy' itemscope>" +
    "<span itemprop='name'>Farmacia Test</span><span class='btorario'>TURNO</span>" +
    "<a class='orario'>Apertura: 8:30-13:00<br>Turno*: fino alle 16:00</a>" +
    "<a href='tel:0981123456'>0981123456</a></div>";
  const dati = parseFarmacieTurno(html);
  assert.equal(dati.length, 1);
  assert.equal(dati[0].nome, "Farmacia Test");
  assert.equal(dati[0].turno, "fino alle 16:00");
});

// ─── 2. Eventi e ricerche commerciali fuori dalla guida ─────────────────────

test("le richieste di eventi non entrano nel ramo Attrazioni", async () => {
  for (const frase of [
    "Che eventi ci sono oggi a Castrovillari?",
    "Cosa succede stasera a Castrovillari?",
  ]) {
    assert.equal(richiestaGuidaAttrazioniPino(frase), false, frase);
    assert.equal(planPinoCoreRequest(frase).route, "events", frase);
  }

  const r = await rispondi("Che eventi ci sono oggi a Castrovillari?");
  assert.doesNotMatch(r.risposta, GUIDA);
});

test("i festival ripiegano sulla guida quando il catalogo eventi è vuoto", async () => {
  for (const frase of ["Voglio andare al festival", "un festival"]) {
    const r = await rispondi(frase);

    assert.match(r.risposta, GUIDA, frase);
    assert.match(r.risposta, /festival/i, frase);
    assert.deepEqual(r.prodotti, [], frase);
    assert.deepEqual(r.negozi, [], frase);
    assert.doesNotMatch(r.risposta, /non risultano eventi pubblicati/i, frase);
  }
});

test("«Cerco scarpe a Castrovillari» resta una ricerca di catalogo", async () => {
  const frase = "Cerco scarpe a Castrovillari";

  assert.equal(richiestaGuidaAttrazioniPino(frase), false);
  assert.equal(isAttractionNameQuery(frase), false);

  const r = await rispondi(frase);
  assert.doesNotMatch(r.risposta, GUIDA);
  assert.doesNotMatch(r.risposta, CASTELLO);
});

// ─── 3. Le richieste di visita restano nella guida ──────────────────────────

test("i nomi e le richieste di visita restano nella guida Attrazioni", async () => {
  for (const frase of [
    "Castello Aragonese",
    "Cosa vedere a Castrovillari",
    "Centro storico",
    "Museums in Castrovillari",
  ]) {
    assert.equal(richiestaGuidaAttrazioniPino(frase), true, frase);
  }

  const italiano = await rispondi("Castello Aragonese");
  assert.match(italiano.risposta, GUIDA);
  assert.match(italiano.risposta, CASTELLO);
  assert.deepEqual(italiano.prodotti, []);
  assert.deepEqual(italiano.negozi, []);

  const inglese = await rispondi("Museums in Castrovillari");
  assert.match(inglese.risposta, GUIDA);
  assert.match(inglese.risposta, /Museo Archeologico/);
});

// ─── 4. Toponimi e parole generiche non identificano un luogo ───────────────

test("i toponimi da soli non identificano un'attrazione", () => {
  for (const toponimo of [
    "Castrovillari",
    "Calabria",
    "Italia",
    "Provincia di Cosenza",
    "Comune di Castrovillari",
  ]) {
    assert.equal(isAttractionNameQuery(toponimo), false, toponimo);
    assert.equal(richiestaGuidaAttrazioniPino(toponimo), false, toponimo);
  }
});

test("i nomi del catalogo restano riconosciuti anche con il toponimo nella frase", () => {
  for (const luogo of [...ATTRAZIONI_LUOGHI, ...ATTRAZIONI_DINTORNI]) {
    const frase = `${luogo.nome} a Castrovillari`;
    assert.equal(isAttractionNameQuery(frase), true, frase);
    assert.equal(richiestaGuidaAttrazioniPino(frase), true, frase);
  }
});

test("«tempo», «stato» e «storia» non identificano da soli un luogo", () => {
  for (const parola of ["tempo", "stato", "storia"]) {
    const luoghi = searchAttractions(parola, 6);
    assert.deepEqual(filtraLuoghiPertinentiGuidaPino(parola, luoghi), [], parola);
  }
});

test("una richiesta ampia senza termini specifici conserva la guida", () => {
  for (const frase of [
    "Cosa posso visitare a Castrovillari?",
    "Ci sono monumenti da visitare?",
    "Trova attrazioni a Castrovillari",
  ]) {
    const luoghi = searchAttractions(frase, 6);
    assert.ok(luoghi.length > 0, frase);
    assert.equal(filtraLuoghiPertinentiGuidaPino(frase, luoghi).length, luoghi.length, frase);
  }
});
