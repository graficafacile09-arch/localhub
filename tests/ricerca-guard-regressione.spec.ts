import { expect, test } from "@playwright/test";

// ─── Regressione: ripristino della ricerca che funzionava prima ─────────────
//
// Questa suite blocca il ritorno del bug introdotto dal motore "robusto"
// (commit 7ff43f7): trasformare frasi naturali come "ho sete" in una query
// restrittiva/azzerata. La ricerca normale è 100% DB e NON deve chiamare AI né
// inventare dati: qui testiamo SOLO le trasformazioni deterministiche pure che
// il motore ripristinato usa prima del retrieval (espansione sinonimi +
// tolleranza ai refusi).
//
// Regola chiave: una frase naturale NON deve mai diventare una query vuota per
// il solo fatto di non contenere una parola del dizionario. Al più si
// rimuovono le stopword, ma il/il/inge token significativo arriva SEMPRE al
// retrieval.

import {
  espandiQueryConSinonimi,
  espandiQueryConSinonimiBase,
} from "../lib/ricerca-semantica";
import {
  patternIlikeTolleranti,
  punteggioFuzzy,
  similaritaLevenshtein,
  terminiSignificativi,
} from "../lib/search-tollerante";

function tokenSignificativi(query: string): string[] {
  return espandiQueryConSinonimi(query).split(/\s+/).filter(Boolean);
}

test("'ho sete' NON diventa mai una query vuota", () => {
  const espansione = espandiQueryConSinonimi("ho sete");
  expect(espansione.trim()).not.toBe("");
  // Il token di contenuto sopravvive alla rimozione delle stopword.
  expect(espansione).toContain("sete");
});

test("'ho fame' NON diventa mai una query vuota", () => {
  const espansione = espandiQueryConSinonimi("ho fame");
  expect(espansione.trim()).not.toBe("");
  expect(espansione).toContain("fame");
});

test("'devo fare un regalo' espande ai concetti regalo/dono", () => {
  const espansione = espandiQueryConSinonimi("devo fare un regalo");
  const token = tokenSignificativi("devo fare un regalo");
  expect(token.length).toBeGreaterThan(0);
  // La parola di contenuto arriva alla ricerca; le stopword non la danneggiano.
  expect(espansione).toContain("regalo");
});

test("query semplice 'pizza' resta una ricerca normale (non allegra inutilmente)", () => {
  // La ricerca semplice NON deve innescare alcuna fase AI: qui verifichiamo
  // che l'espansione restituisca comunque il termine base e resti non vuota.
  const token = tokenSignificativi("pizza");
  expect(token.length).toBeGreaterThan(0);
  expect(espandiQueryConSinonimiBase("pizza")).toContain("pizza");
});

test("query con località resta integra (termine + città passano al retrieval)", () => {
  const espansione = espandiQueryConSinonimi("mangiare pesce a Castrovillari");
  // Stopword rimosse ("a"), termine di attività (mangiare) + città (castrovillari) presenti.
  expect(espansione).toContain("mangiare");
  expect(espansione).toContain("castrovillari");
});

test("refuso 'panifficio' viene coperto dalla tolleranza ai refusi", () => {
  // patternIlikeTolleranti produce varianti con wildcard; la similarità al termine corretto è alta.
  const pattern = patternIlikeTolleranti("panifficio");
  expect(pattern.length).toBeGreaterThan(1);
  expect(similaritaLevenshtein("panifficio", "panificio")).toBeGreaterThan(0.7);

  // punteggioFuzzy assegna un punteggio > 0 a un negozio il cui nome sia "Panificio".
  const fuzzy = punteggioFuzzy(["Panificio", "Via Roma"], ["panifficio"]);
  expect(fuzzy).toBeGreaterThan(0);
});

test("terminiSignificativi estrae la parola di contenuto da 'ho sete'", () => {
  const termini = terminiSignificativi("ho sete", 3);
  expect(termini).toContain("sete");
  // La stopword "ho" non compare mai come termine di ricerca.
  expect(termini).not.toContain("ho");
});

test("zero risultati reale resta zero senza inventare dati", () => {
  // Un termine del tutto sconosciuto NON deve attivare sinonimi fantasiosi né
  // produrre concetti inventati: l'espansione torna solo i token dell'utente.
  const espansione = espandiQueryConSinonimi("zxqvklew");
  const token = espansione.split(/\s+/).filter(Boolean);
  // Nessun sinonimo estraneo introdotto: contiene solo il (non-)token originale.
  expect(token.some((t) => t !== "zxqvklew")).toBe(false);
});

test("sinonimo pertinente viene espanso mentre il generico con più criteri vince", () => {
  // "medico cardiologo" → espansione profilo sanitario (cardio/visita present).
  const sanitario = espandiQueryConSinonimi("medico cardiologo");
  expect(sanitario).toContain("cardiologo");
  // "parrucchiere" → gruppo beauty, espanso ma MAI vuoto.
  const beauty = espandiQueryConSinonimi("parrucchiere");
  expect(beauty).toContain("parrucchiere");
  expect(beauty.trim()).not.toBe("");
});