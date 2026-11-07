/**
 * Pino — «Ho fame» non deve finire in un vicolo cieco.
 *
 * Difetto osservato in produzione: «ho fame» rispondeva in ~500 ms, senza AI,
 * con «Non risultano attività con questi criteri nel catalogo InCittà. Prova
 * con un'altra categoria o zona.» mentre il catalogo pubblica gastronomie,
 * panifici e alimentari. Il piano deterministico cercava un solo termine
 * («ristorante») e non aveva alcun ripiego sul cibo pronto.
 *
 * Qui il database è il client finto di `tests/support/hook-pino.mjs` (nessuna
 * riga restituita): si verifica il ramo peggiore, cioè catalogo davvero vuoto.
 * Il percorso resta deterministico: la rete è disattivata e non parte alcuna
 * chiamata al modello.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { chatConAssistente } from "../lib/assistente/index.ts";
import {
  messaggioRistorazioneSenzaLocaliPino,
  messaggioRistorazioneVuotaPino,
} from "../lib/assistente/messaggi-pino.ts";
import { richiestaRistorazionePino } from "../lib/assistente/routing-policy.ts";

globalThis.fetch = async (url) => {
  throw new Error(`rete disattivata nei test Pino: ${String(url)}`);
};

const u = (content) => ({ role: "user", content });

test("«ho fame» non risponde con il vicolo cieco generico delle attività", async () => {
  const r = await chatConAssistente([u("ho fame")]);

  assert.doesNotMatch(r.risposta, /Non risultano attività con questi criteri/);
  assert.match(r.risposta, /ristoranti|pizzerie/i);
  // Nessun risultato inventato: il catalogo finto è vuoto.
  assert.deepEqual(r.negozi, []);
  assert.deepEqual(r.prodotti, []);
});

test("anche le altre forme di fame restano nel dominio ristorazione", async () => {
  for (const frase of ["dove posso mangiare?", "vorrei mangiare qualcosa"]) {
    assert.equal(richiestaRistorazionePino(frase), true, frase);
    const r = await chatConAssistente([u(frase)]);
    assert.doesNotMatch(
      r.risposta,
      /Non risultano attività con questi criteri/,
      frase
    );
  }
});

test("la lingua della risposta viene rispettata", () => {
  assert.match(messaggioRistorazioneVuotaPino("en"), /I won't make one up/);
  assert.match(messaggioRistorazioneVuotaPino("it"), /Non ne invento/);
  assert.match(
    messaggioRistorazioneSenzaLocaliPino("it"),
    /non come ristoranti/
  );
  assert.match(
    messaggioRistorazioneSenzaLocaliPino("en"),
    /not as restaurants/
  );
});
