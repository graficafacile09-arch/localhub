import assert from "node:assert/strict";
import test from "node:test";
import { contaRisultatiPino, moodDaRispostaPino } from "../components/assistant/pino-fetch.ts";

/**
 * Lo stato d'animo della chat non si decide più su un solo array: una risposta
 * con notizie, contenuti, offerte o eventi è una risposta piena anche quando
 * `negozi` e `prodotti` restano vuoti. Questi test bloccano la regressione
 * «Pino trova risultati e diventa triste».
 */

const risposta = (campi) => ({ risposta: "", negozi: [], prodotti: [], processingMs: 1, source: "assistente", ...campi });

test("negozi trovati: allegro", () => {
  const dati = risposta({ negozi: [{ id: 1 }] });
  assert.equal(contaRisultatiPino(dati), 1);
  assert.equal(moodDaRispostaPino(dati), "happy");
});

test("solo prodotti trovati: allegro", () => {
  const dati = risposta({ prodotti: [{ id: 1 }, { id: 2 }], intent: "product" });
  assert.equal(contaRisultatiPino(dati), 2);
  assert.equal(moodDaRispostaPino(dati), "happy");
});

test("risultati fuori dagli array storici (notizie e contenuti): allegro", () => {
  const dati = risposta({ notizie: [{ id: 1 }], contenuti: [{ id: 2 }], intent: "generic" });
  assert.equal(contaRisultatiPino(dati), 2);
  assert.equal(moodDaRispostaPino(dati), "happy");
});

test("risultati solo nel testo (offerte, eventi, farmacie): allegro dal conteggio del server", () => {
  for (const intent of ["product", "food", "service"]) {
    const dati = risposta({ intent, risultatiTrovati: 3 });
    assert.equal(contaRisultatiPino(dati), 3);
    assert.equal(moodDaRispostaPino(dati), "happy", `intent ${intent}`);
  }
});

test("un elenco nuovo entra nel conteggio senza toccare la chat", () => {
  const dati = risposta({ schede: [{ id: 1 }], luoghi: [{ id: 2 }] });
  assert.equal(contaRisultatiPino(dati), 2);
  assert.equal(moodDaRispostaPino(dati), "happy");
});

test("ricerca senza alcun risultato: triste", () => {
  for (const intent of ["product", "food", "drink", "service", "gift"]) {
    const dati = risposta({ intent, risultatiTrovati: 0 });
    assert.equal(contaRisultatiPino(dati), 0);
    assert.equal(moodDaRispostaPino(dati), "sad", `intent ${intent}`);
  }
});

test("saluto o domanda generica senza risultati: neutro", () => {
  assert.equal(moodDaRispostaPino(risposta({ intent: "generic" })), "neutral");
});

// Il classificatore ripiega su "product" anche su «ciao»: il saluto si
// riconosce dal fatto che il turno non ha invocato strumenti.
test("turno senza ricerca (saluto, cortesia, risposta diretta): neutro anche con intent product", () => {
  const dati = risposta({ intent: "product", ricercaEseguita: false });
  assert.equal(moodDaRispostaPino(dati), "neutral");
});

test("ricerca eseguita e zero risultati: triste", () => {
  const dati = risposta({ intent: "product", ricercaEseguita: true, risultatiTrovati: 0 });
  assert.equal(moodDaRispostaPino(dati), "sad");
});

test("risultati trovati restano allegri anche con ricerca dichiarata", () => {
  const dati = risposta({ ricercaEseguita: true, notizie: [{ id: 1 }] });
  assert.equal(moodDaRispostaPino(dati), "happy");
});

test("percorso degradato (metadati assenti) senza risultati: triste, non neutro", () => {
  assert.equal(moodDaRispostaPino(risposta({})), "sad");
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
