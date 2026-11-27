import assert from "node:assert/strict";
import test from "node:test";
import { contaRisultatiPino, eSalutoBreve, moodDaRispostaPino } from "../components/assistant/pino-fetch.ts";

/**
 * Regola dello stato d'animo di Pino (infallibile, basata sulla risposta):
 * - TRISTE: solo per errore, oppure 0 risultati strutturati con testo che
 *   dichiara un mancato ritrovamento (o testo vuoto);
 * - ALLEGRO: almeno 1 risultato strutturato, oppure testo utile senza frasi
 *   di esito negativo (anche se la ricerca non ha prodotto schede);
 * - NEUTRO: solo saluti e convenevoli brevi.
 */

const risposta = (campi) => ({ risposta: "", negozi: [], prodotti: [], processingMs: 1, source: "assistente", ...campi });
const testoUtile = "Ecco le informazioni sulle filiere calabresi: la 'nduja di Spilinga è un salume piccante tipico.";

test("negozi trovati: allegro", () => {
  const dati = risposta({ negozi: [{ id: 1 }] });
  assert.equal(contaRisultatiPino(dati), 1);
  assert.equal(moodDaRispostaPino(dati, "negozi a Cosenza"), "happy");
});

test("solo prodotti trovati: allegro", () => {
  const dati = risposta({ prodotti: [{ id: 1 }, { id: 2 }] });
  assert.equal(moodDaRispostaPino(dati, "olio"), "happy");
});

test("risultati in notizie, contenuti, offerte, eventi: allegro", () => {
  const dati = risposta({ notizie: [{ id: 1 }], contenuti: [{ id: 2 }] });
  assert.equal(contaRisultatiPino(dati), 2);
  assert.equal(moodDaRispostaPino(dati, "notizie sul tartufo"), "happy");
});

test("risultati solo nel testo (conteggio dichiarato dal server): allegro", () => {
  const dati = risposta({ risultatiTrovati: 3, risposta: "Ho trovato 3 offerte." });
  assert.equal(moodDaRispostaPino(dati, "offerte del mese"), "happy");
});

test("un elenco nuovo entra nel conteggio senza toccare la chat", () => {
  const dati = risposta({ schede: [{ id: 1 }], luoghi: [{ id: 2 }] });
  assert.equal(contaRisultatiPino(dati), 2);
  assert.equal(moodDaRispostaPino(dati, "parchi"), "happy");
});

test("zero risultati e testo di esito negativo: triste", () => {
  const frasi = [
    "Non ho trovato risultati per questa ricerca.",
    "Non risultano offerte attive.",
    "Nessun risultato corrispondente.",
    "Nessuna attività trovata a Cosenza.",
    "Nessun negozio aperto ora.",
    "Nessun prodotto con questo nome.",
    "Non ci sono eventi in programma.",
    "Spiacente, non posso aiutarti con questo.",
  ];
  for (const testo of frasi) {
    assert.equal(moodDaRispostaPino(risposta({ risposta: testo }), "domanda"), "sad", testo);
  }
});

test("zero risultati ma testo utile (domanda sul catalogo): allegro, non triste", () => {
  // Caso del bug: ricercaEseguita true, risultatiTrovati 0, ma la risposta è valida.
  const dati = risposta({ risposta: testoUtile, ricercaEseguita: true, risultatiTrovati: 0 });
  assert.equal(moodDaRispostaPino(dati, "Esplora le filiere calabresi"), "happy");
});

test("suggerimenti preimpostati con testo utile: allegro", () => {
  const suggerimenti = [
    "Esplora le filiere calabresi",
    "Cerca un prodotto DOP o IGP",
    "Scopri i parchi della Calabria",
    "Ultime notizie sulle filiere",
    "Produttori e eccellenze del territorio",
  ];
  for (const domanda of suggerimenti) {
    const dati = risposta({ risposta: testoUtile, risultatiTrovati: 0 });
    assert.equal(moodDaRispostaPino(dati, domanda), "happy", domanda);
  }
});

test("saluti e convenevoli brevi: neutro", () => {
  for (const domanda of ["ciao", "Grazie", "chi sei", "buongiorno"]) {
    assert.equal(eSalutoBreve(domanda), true, domanda);
    const dati = risposta({ risposta: "Ciao! Sono Pino." });
    assert.equal(moodDaRispostaPino(dati, domanda), "neutral", domanda);
  }
});

test("una domanda reale non è un saluto anche se inizia come tale", () => {
  assert.equal(eSalutoBreve("ciao, dove trovo i prodotti DOP a Cosenza e Rende"), false);
});

test("risposta vuota senza risultati: triste", () => {
  assert.equal(moodDaRispostaPino(risposta({ risposta: "   " }), "olio"), "sad");
});

test("payload incompleto o assente non fa fallire il conteggio", () => {
  assert.equal(contaRisultatiPino(undefined), 0);
  assert.equal(contaRisultatiPino(null), 0);
  assert.equal(contaRisultatiPino({ negozi: null, prodotti: "x", notizie: {} }), 0);
  assert.equal(moodDaRispostaPino(undefined), "sad");
});

test("il conteggio dichiarato non abbassa quello reale", () => {
  const dati = risposta({ negozi: [{ id: 1 }, { id: 2 }], risultatiTrovati: 1 });
  assert.equal(contaRisultatiPino(dati), 2);
});
