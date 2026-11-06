import assert from "node:assert/strict";
import test from "node:test";
import { trovaRispostaFaqPino } from "../lib/assistente/faq.ts";

test("FAQ: trova informazioni su InCittà", () => {
  const faq = trovaRispostaFaqPino("Che cos'è InCittà?");
  assert.ok(faq);
  assert.match(faq.risposta, /piattaforma digitale/i);
});

test("FAQ: riconosce domande naturali sul funzionamento", () => {
  const faq = trovaRispostaFaqPino("Come funziona InCittà?");
  assert.ok(faq);
  assert.match(faq.risposta, /piattaforma digitale/i);
});

test("FAQ: trova le informazioni sui pagamenti", () => {
  const faq = trovaRispostaFaqPino("Quali metodi di pagamento posso utilizzare?");
  assert.ok(faq);
  assert.match(faq.risposta, /checkout/i);
});

test("FAQ: non risponde a richieste non coperte", () => {
  assert.equal(trovaRispostaFaqPino("Che tempo farà domani?"), null);
});

test("FAQ: apertura negozio usa la risposta pubblicata", () => {
  const apertura = trovaRispostaFaqPino("come apro un negozio?");
  assert.ok(apertura);
  assert.match(apertura.domanda, /aprire un negozio/i);
});

test("FAQ: l'annullamento non viene dirottato sulla FAQ generica dell'ordine", () => {
  // Non esiste una FAQ pubblicata dedicata all'annullamento: la risposta
  // generica «problema con l'ordine» non risponde alla domanda e non deve
  // essere presentata come tale. Il ramo capacità di Pino gestisce l'azione.
  assert.equal(trovaRispostaFaqPino("posso annullare un ordine?"), null);
  assert.equal(trovaRispostaFaqPino("come cancello un acquisto?"), null);
});

test("FAQ: resi e spedizione usano le risposte pubblicate, senza policy inventate", () => {
  const reso = trovaRispostaFaqPino("posso fare un reso?");
  assert.ok(reso);
  assert.match(reso.risposta, /Venditore/);
  assert.doesNotMatch(reso.risposta, /14 giorni/);

  const spedizione = trovaRispostaFaqPino("come funziona la spedizione?");
  assert.ok(spedizione);
  assert.match(spedizione.risposta, /Venditore/);
});
