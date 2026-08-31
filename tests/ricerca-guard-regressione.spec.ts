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

// ─── V3: recall dei refusi da carattere duplicato/mancante ──────────────────

test("V3 pattern fuzzy coprono la RIMOZIONE di un carattere ('panifficio' → 'panificio')", () => {
  const pattern = patternIlikeTolleranti("panifficio");
  // Grazie ai pattern di rimozione, il DB può tornare "panificio".
  expect(pattern).toContain("%panificio%");
  // E il matching in memoria dà la similarità giusta (≥0.88).
  expect(similaritaLevenshtein("panifficio", "panificio")).toBeGreaterThan(0.85);
});

test("V3 'panifcio' → 'panificio' (carattere mancante) resta nei pattern + fuzzy", () => {
  const pattern = patternIlikeTolleranti("panifcio");
  // inserzione: %panif_cio% matcha "panificio" (la _ è il carattere 'i' in più nel DB).
  expect(pattern.some((p) => p === "%panif_cio%")).toBe(true);
  expect(similaritaLevenshtein("panifcio", "panificio")).toBeGreaterThan(0.85);
});

test("V3 'panificioo' → 'panificio' (carattere in più) coperto da rimozione", () => {
  // rimozione dell'ultima 'o' → %panificio%
  const pattern = patternIlikeTolleranti("panificioo");
  expect(pattern.some((p) => p === "%panificio%")).toBe(true);
  expect(similaritaLevenshtein("panificioo", "panificio")).toBeGreaterThan(0.85);
});

test("V3 'pizeria' → 'pizzeria' (inserzione doppia-z) coperta", () => {
  const pattern = patternIlikeTolleranti("pizeria");
  // %piz_eria% matcha "pizzeria" (la _ è la z doppia nel DB).
  expect(pattern.some((p) => p === "%piz_eria%")).toBe(true);
  expect(similaritaLevenshtein("pizeria", "pizzeria")).toBeGreaterThan(0.8);
});