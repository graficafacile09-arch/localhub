/**
 * ASSISTENTE — Interpretazione deterministica + retrieval robusto + grounding
 *
 * Test PURI (senza browser, senza DB, senza LLM): verificano la "comprensione
 * della richiesta" e l'espansione ibrida (lib/assistente/interprete.ts), la
 * base di sinonimi (lib/ricerca-semantica.ts) e il ranking grounded
 * (lib/ranking-negozi.ts), con fixture rappresentative del database.
 *
 * Copre i casi richiesti: match esatto, sinonimo, query descrittiva, refuso,
 * singolare/plurale, categoria, località, più criteri, query generica, nessun
 * risultato, pertinenza davanti a risultati vagamente simili e assenza di
 * allucinazioni (l'AI risponde SOLO sui dati recuperati).
 */
import { test, expect } from "@playwright/test";
import {
  analizzaRichiesta,
  dovrebbeUsareMotoreRobusto,
  espandiQueryIbrida,
  variantiQuery,
} from "@/lib/assistente/interprete";
import {
  espandiQueryConSinonimi,
  espandiQueryConSinonimiBase,
} from "@/lib/ricerca-semantica";
import {
  calcolaPunteggioNegozioConEspansione,
  filtraNegoziPerPertinenzaConEspansione,
} from "@/lib/ranking-negozi";
import { radice } from "@/lib/text-utils";
import {
  buildContextoRisultati,
  buildFinalPrompt,
} from "@/lib/assistente/prompt";
import { unisciPerId } from "@/lib/assistente/ricerca-estesa";

test("1. match esatto: una query semplice attiva i termini reali", () => {
  const a = analizzaRichiesta("farmacia");
  expect(a.terminiPuliti).toContain("farmacia");
  expect(espandiQueryConSinonimi("farmacia").split(/\s+/)).toContain("farmacia");
});

test("2. sinonimo: parrucchiere espande a barbiere e profilo beauty", () => {
  const estesa = espandiQueryConSinonimi("parrucchiere");
  expect(estesa).toContain("barbiere");
  const a = analizzaRichiesta("parrucchiere");
  expect(a.tipoAttivita).toContain("beauty");
});

test("3. query descrittiva: regalo tipico calabrese → concetti reali", () => {
  const a = analizzaRichiesta("vorrei qualcosa per fare un regalo tipico calabrese");
  // Città NON falsamente rilevata, e concetti estratti: regalo, tipico/calabrese.
  expect(a.citta).toBeNull();
  expect(a.topic.join(" ")).toContain("regalo");
  expect(a.topic.join(" ")).toContain("tipico");
  expect(a.topic.join(" ")).toContain("calabrese");
  expect(a.topic.join(" ")).toContain("cesti");
  // Un profilo attività derivato dal topic (alimentari/artigianato).
  expect(a.tipoAttivita.length).toBeGreaterThan(0);
  // La variante ibrida include i lexemi descrittivi (il DB cerca anche "cesti").
  const ibrida = espandiQueryIbrida("vorrei qualcosa per fare un regalo tipico calabrese");
  expect(ibrida).toContain("calabrese");
  expect(ibrida).toContain("cesti");
  // varianti prodotte (≥1 non banale)
  expect(variantiQuery("vorrei qualcosa per fare un regalo tipico calabrese").length).toBeGreaterThanOrEqual(1);
});

test("4. refuso ortografico: il soggetto resta recuperabile dal fallback fuzzy", () => {
  // Un refuso (panifficio) NON deve essere ripulito via — resta un token che
  // il fallback tollerante (Levenshtein) può ricondurre a "panificio".
  const a = analizzaRichiesta("panifficio");
  expect(a.terminiPuliti).toContain("panifficio");
  expect(variantiQuery("panifficio")[0]).toContain("panifficio");
});

test("5. singolare/plurale: stessa radice e sinonimo", () => {
  expect(radice("farmacie")).toBe(radice("farmacia"));
  expect(espandiQueryConSinonimi("farmacie")).toContain("farmacia");
  expect(radice("parrucchieri")).toBe(radice("parrucchiere"));
});

test("6. categoria + località + più criteri: posto per mangiare pesce a Castrovillari", () => {
  const a = analizzaRichiesta("un posto dove mangiare pesce a castrovillari");
  expect(a.citta).toBe("castrovillari");
  expect(a.topic.join(" ")).toContain("pesce");
  // categoria derivata dal topic pesce → pescheria/ristorante.
  expect(a.categorieRilevanti.join(" ")).toContain("pescheria");
});

test("7. località isolata: negozio a Cosenza", () => {
  const a = analizzaRichiesta("negozio a cosenza");
  expect(a.citta).toBe("cosenza");
  expect(a.ricerca).not.toContain("cosenza");
});

test("8. più criteri: medico cardiologo a Castrovillari", () => {
  const a = analizzaRichiesta("medico cardiologo a castrovillari");
  expect(a.tipoAttivita).toContain("medico");
  expect(a.citta).toBe("castrovillari");
  // "cardiologia" entra nel vocabolario (profilo medico) anche se l'utente
  // scrive "cardiologo".
  expect(espandiQueryConSinonimi("cardiologo").split(/\s+/)).toContain("cardiologia");
});

test("9. query molto generica/semplice non viene 'rotta' e produce varianti", () => {
  // "pizza" → riconosciuta come attività (categoria Pizzeria) senza città/tipo.
  const pizza = analizzaRichiesta("pizza");
  expect(pizza.citta).toBeNull();
  expect(variantiQuery("pizza").length).toBeGreaterThan(0);
  // Query priva di senso → intento generico, soggetto sicuro, mai eccezioni.
  const boh = analizzaRichiesta("boh");
  expect(boh.intento).toBe("generico");
  expect(Array.isArray(boh.terminiPuliti)).toBe(true);
});

test("10. nessun risultato: query vuota non genera varianti", () => {
  expect(variantiQuery("")).toEqual([]);
  expect(variantiQuery("   ")).toEqual([]);
  const vuota = analizzaRichiesta("");
  expect(vuota.ricerca).toBe("");
});

test("11. ranking: il match originario vince sui risultati solo 'vagamente simili'", () => {
  // Farmacia Centrale matcha il termine ORIGINALE "farmacia" nel nome:
  // Salute e benessere matcha SOLO il sinonimo espanso "salute"/"benessere".
  const farmacia = {
    id: "a",
    nome: "Farmacia Centrale",
    categoria: "Farmacia",
    tipo_attivita: "altro",
  };
  const salute = {
    id: "b",
    nome: "Salute e benessere",
    categoria: "Salute e benessere",
    tipo_attivita: "salute",
  };

  const originali = ["farmacia"];
  const espansi = espandiQueryConSinonimi("farmacia").split(/\s+/);

  const scoreFarmacia = calcolaPunteggioNegozioConEspansione(farmacia, originali, espansi);
  const scoreSalute = calcolaPunteggioNegozioConEspansione(salute, originali, espansi);
  expect(scoreFarmacia).toBeGreaterThan(scoreSalute);

  // L'ordine del ranking mette davanti il match esatto.
  const ordinati = filtraNegoziPerPertinenzaConEspansione(
    [salute, farmacia],
    originali,
    espansi
  );
  expect(ordinati[0].nome).toBe("Farmacia Centrale");

  // Un risultato completamente fuori contesto (pet shop) con punteggio 0
  // viene escluso dal ranking (soglia di pertinenza): niente spazzatura.
  const pet = { id: "c", nome: "Pet Store", categoria: "Animali e pet shop" };
  const filtri = filtraNegoziPerPertinenzaConEspansione(
    [salute, farmacia, pet],
    originali,
    espansi
  );
  expect(filtri.some((n) => n.nome === "Pet Store")).toBe(false);
});

test("12. nessuna allucinazione: il contesto finale usa SOLO i dati recuperati", () => {
  // Con zero risultati, il contesto lo dichiara onestamente e NON inventa
  // nomi di negozi/prodotti.
  const vuoto = buildContextoRisultati({
    negozi: [],
    prodotti: [],
    offerte: [],
    eventi: [],
    categorie: [],
  });
  expect(vuoto).toContain("Nessun risultato trovato");
  expect(vuoto).not.toMatch(/[-*]{2,}/);

  // Anche il prompt finale della risposta include il contesto recuperato e la
  // regola di grounding (usare SOLO i dati sopra).
  const prompt = buildFinalPrompt([{ role: "user", content: "test" }], vuoto);
  expect(prompt).toContain("SOLO i dati");
  expect(prompt).toContain(vuoto.slice(0, 30));
});

// ── SEARCH NORMALE: stesso motore robusto condiviso (lib/search-service.ts) ──

test("search.normale: query semplice con risultati → NON attiva il motore robusto (veloce)", () => {
  // "parrucchiere" è gestita bene dal retrieval diretto (sinonimo barbiere):
  // se il diretto trova risultati, il robusto NON deve scattare.
  const a = analizzaRichiesta("parrucchiere");
  expect(dovrebbeUsareMotoreRobusto(a, /* primarioVuoto */ false)).toBe(false);
  // "pizza" resta immediata: nessuna chiamata AI, nessun overhead.
  const pizza = analizzaRichiesta("pizza");
  expect(dovrebbeUsareMotoreRobusto(pizza, false)).toBe(false);
});

test("search.normale: cascade su zero risultati → attiva il motore robusto", () => {
  const a = analizzaRichiesta("panifficio");
  // il diretto non ha trovato nulla (refuso) → il robusto/fuzzy deve scattare.
  expect(dovrebbeUsareMotoreRobusto(a, /* primarioVuoto */ true)).toBe(true);
  // query vuota / non significativa ma direzione diretta vuota → robusto attivo
  const b = analizzaRichiesta("qualcosa per un regalo");
  expect(dovrebbeUsareMotoreRobusto(b, true)).toBe(true);
});

test("search.normale: località o concetto descrittivo → attiva il motore robusto", () => {
  expect(dovrebbeUsareMotoreRobusto(analizzaRichiesta("mangiare pesce a castrovillari"), false)).toBe(true);
  expect(dovrebbeUsareMotoreRobusto(analizzaRichiesta("regalo tipico calabrese"), false)).toBe(true);
  expect(dovrebbeUsareMotoreRobusto(analizzaRichiesta("negozio a cosenza"), false)).toBe(true);
  expect(dovrebbeUsareMotoreRobusto(analizzaRichiesta("visita al cuore"), false)).toBe(true);
});

test("search.normale: nessuna duplicazione nella fusione multi-variante", () => {
  // variantiQuery non produce mai stringhe duplicate.
  const v = variantiQuery("qualcosa per un regalo tipico");
  expect(new Set(v).size).toBe(v.length);
  // la fusione dedup per id mantiene solo la prima occorrenza.
  const fusa = unisciPerId(
    [{ id: "1" }, { id: "2" }],
    [{ id: "2" }, { id: "3" }, { id: "2" }]
  );
  expect(fusa.map((x) => x.id)).toEqual(["1", "2", "3"]);
});

test("search.normale: combinazioni di criteri restano robuste", () => {
  // categoria + località + più criteri → query coerenti per il retrieval.
  const a = analizzaRichiesta("mangiare pesce a castrovillari");
  expect(dovrebbeUsareMotoreRobusto(a, false)).toBe(true);
  expect(a.citta).toBe("castrovillari");
  expect(a.topic.join(" ")).toContain("pesce");
  // varianti non vuote, nessuna inclusa in un'altra in modo ridondante/duplicato
  const v = variantiQuery("mangiare pesce a castrovillari");
  expect(v.length).toBeGreaterThanOrEqual(1);
});

test("search.normale: query generica/priva di senso → retrieval robusto comunque innocuo", () => {
  // Anche se diventa robusto (primario vuoto), non deve mai rompere o lanciare.
  const a = analizzaRichiesta("asdflkj");
  expect(Array.isArray(a.terminiPuliti)).toBe(true);
  expect(dovrebbeUsareMotoreRobusto(a, true)).toBe(true); // cascade tutelata
});

test("search.normale: esempi richiesti espandono correttamente", () => {
  // "prodotti tipici" → concetto tipico (alimentari/artigianato).
  expect(espandiQueryConSinonimi("prodotti tipici").split(/\s+/)).toContain("calabrese");
  expect(espandiQueryConSinonimi("prodotti tipici").split(/\s+/)).toContain("artigianale");
  // "medico cardiologo" → profil medico + cardiologia.
  const med = analizzaRichiesta("medico cardiologo");
  expect(med.tipoAttivita).toContain("medico");
  // "visita al cuore" → topic cuore/cardiologia.
  expect(analizzaRichiesta("visita al cuore").topic.join(" ")).toContain("cuore");
});

test("base sinonimi prodotti: la ricerca prodotti espande senza il vocabolario medico", () => {
  // Per i PRODOTTI non si includono i sinonimi dei profili (evita falsi
  // positivi tipo "dottore" → latte): la funzione base del prodotto è solo
  // categorie/commercio.
  const baseProdotti = espandiQueryConSinonimiBase("regalo");
  expect(baseProdotti.split(/\s+/)).toContain("regalo");
  const basePesce = espandiQueryConSinonimiBase("pesce");
  expect(basePesce.split(/\s+/)).toContain("pescheria");
});