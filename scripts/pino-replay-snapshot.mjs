/**
 * Pino — Replay offline sullo snapshot di catalogo.
 *
 * Esegue il percorso DETERMINISTICO di Pino su un catalogo reale congelato
 * (`pino-p1-3-3-catalog-snapshot-20261104.json`) e misura ciò che finora non
 * era misurato: quante richieste restituiscono zero prodotti DOPO i gate di
 * pertinenza, e se i prodotti attesi ci sono.
 *
 * Cosa fa, esattamente:
 *   1. piano: `pianoLocaleIntelligente` (o `fallbackPlan`) con la query
 *      normalizzata da `normalizzaQueryCatalogo`;
 *   2. retrieval SIMULATO con la stessa semantica della query Supabase
 *      (`ilike ... OR ...` sui campi del prodotto, termini = sinonimi base +
 *      concetti d'intento + radici), più il fallback sigle;
 *   3. gate REALI: `filtraProdottiAlimentariPino` / `filtraProdottiPerSoggettoUnico`.
 *
 * Cosa NON fa: nessuna chiamata a Gemini, nessun accesso a Supabase, nessun
 * ranking pubblico (che vive in `lib/negozi.ts` e non è replicato qui). Quindi
 * i numeri sono un limite superiore onesto del recall deterministico, non il
 * punteggio del Pino di produzione.
 *
 * Uso: `npm run benchmark:pino:replay`
 */
import { readFileSync } from "node:fs";
import { normalizza, soloSigle, equivalenzaSigla } from "../lib/text-utils.ts";
import { espandiQueryConSinonimiBase } from "../lib/ricerca-semantica.ts";
import { concettiIntento } from "../lib/ricerca-intento.ts";
import { radiceRicerca } from "../lib/search-tollerante.ts";
import { normalizzaQueryCatalogo } from "../lib/assistente/understanding.ts";
import { analizzaIntentoPino } from "../lib/assistente/intent.ts";
import { pianoLocaleIntelligente, fallbackPlan } from "../lib/assistente/semantica.ts";
import {
  filtraProdottiAlimentariPino,
  filtraProdottiPerSoggettoUnico,
  FORMATI_PASTA_PINO,
} from "../lib/assistente/tools.ts";
import { soggettoAlimentarePino } from "../lib/assistente/lexicon.ts";

// Con `PINO_REPLAY_VERBOSE=1` stampa anche gli id ammessi: serve a scrivere
// nuove attese sul catalogo reale invece di indovinarle.
const VERBOSE = process.env.PINO_REPLAY_VERBOSE === "1";

const snapshot = JSON.parse(
  readFileSync(
    new URL("./pino-p1-3-3-catalog-snapshot-20261104.json", import.meta.url),
    "utf8"
  )
);
const prodotti = (snapshot.prodotti ?? []).map((p) => ({
  ...p,
  // Campi letti dai gate: in produzione arrivano dalle proprietà non
  // enumerabili di `mappaProdottoRicerca`, qui sono già nel JSON.
  parole_chiave: p.parole_chiave ?? [],
  caratteristiche: p.caratteristiche ?? [],
}));

const testoProdotto = (p) =>
  normalizza(
    [
      p.nome,
      p.categoria,
      p.sottocategoria,
      p.marca,
      p.descrizione,
      p.descrizione_completa,
      p.seo_title,
      p.seo_description,
      p.alt_text_immagine,
      ...(p.parole_chiave ?? []),
      ...(p.caratteristiche ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );

/** Termini di recall come in `cercaProdottiCore` (sinonimi base + radici). */
function terminiRecall(query) {
  const radici = normalizza(query)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .map(radiceRicerca)
    .filter((t) => t.length >= 4);
  return Array.from(
    new Set(
      `${concettiIntento(query)} ${espandiQueryConSinonimiBase(query)} ${radici.join(" ")}`
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 24);
}

/** Retrieval simulato: OR su sottostringa, come la query PostgREST di Pino. */
function recupera(query) {
  const termini = terminiRecall(query);
  const trovati = prodotti.filter((p) => {
    const testo = testoProdotto(p);
    return termini.some((t) => testo.includes(t));
  });
  if (trovati.length > 0) return { trovati, via: "sottostringa" };

  // Fallback sigle (come in cercaProdottiCore): solo con query di sole sigle.
  if (soloSigle(query)) {
    const sigla = normalizza(query).trim();
    const perSigla = prodotti.filter((p) =>
      equivalenzaSigla(sigla, normalizza([p.nome, p.categoria].filter(Boolean).join(" ")))
    );
    if (perSigla.length > 0) return { trovati: perSigla, via: "sigla" };
  }
  return { trovati, via: "nessuno" };
}

/** Percorso deterministico completo per una query. */
function esegui(query) {
  const inizio = performance.now();
  const analisi = analizzaIntentoPino(query);
  const piano = pianoLocaleIntelligente(query, analisi) ?? fallbackPlan(query, analisi);
  const { trovati, via } = recupera(query);

  const soggettoAlimentare = soggettoAlimentarePino(query);
  // Come `searchProducts`: per la pasta una seconda ricerca SOLO con i formati,
  // perché il nome del prodotto può non contenere la parola «pasta».
  const trovatiTotali =
    soggettoAlimentare === "pasta"
      ? [...trovati, ...recupera(FORMATI_PASTA_PINO.slice(0, 10).join(" ")).trovati]
      : trovati;
  const filtrati = soggettoAlimentare
    ? filtraProdottiAlimentariPino(trovatiTotali, query, soggettoAlimentare)
    : filtraProdottiPerSoggettoUnico(trovatiTotali, normalizzaQueryCatalogo(query), query);
  // `searchProducts` deduplica per id: la seconda ricerca della pasta può
  // restituire due volte lo stesso formato, e il conteggio deve essere fedele.
  const visti = new Set();
  const risultati = filtrati.filter((p) => {
    const id = String(p.id);
    if (visti.has(id)) return false;
    visti.add(id);
    return true;
  });

  return {
    query,
    piano: piano.query,
    surface: piano.surface,
    trovati: trovati.length,
    ammessi: risultati.length,
    via,
    ids: risultati.map((p) => p.id),
    ms: Math.round((performance.now() - inizio) * 100) / 100,
  };
}

// Attese minime, scritte a mano sul catalogo reale: non sono una soglia
// globale, sono i casi che non devono MAI tornare vuoti.
const ATTESE = [
  { query: "evo", contiene: [1376], esclude: [1371] },
  { query: "olio evo", contiene: [1376] },
  { query: "extravergine", contiene: [1376, 1507] },
  { query: "olio extra vergine", contiene: [1376, 1507] },
  { query: "olio", contiene: [1376, 1507] },
  { query: "vino", contiene: [1377] },
  { query: "miele", contiene: [1374, 1375] },
  { query: "cipolla bianca", contiene: [1371] },
  { query: "pecorino", contiene: [1508] },
  { query: "pizza", contiene: [1489] },
  { query: "taralli", contiene: [1519] },
  { query: "biscotti", contiene: [1523] },
  { query: "anello argento", contiene: [1524], esclude: [1430] },
  { query: "orologio", contiene: [218, 1360] },
  // 1491 «Strascinati farina 00» è un GAP NOTO: il nome non contiene «pasta» e
  // la ricerca di completamento usa solo i primi 10 formati (limite PostgREST),
  // quindi non lo recupera. Resta fuori dalle attese finché l'ordine dei formati
  // non cambia; il test P1.3.4 lo copre con un recupero più ampio.
  { query: "pasta", contiene: [1490, 1513, 1517] },
  // Casi emersi dal controllo post-deploy: plurali, nomi di formato e
  // qualificatori non documentati (che ora degradano invece di azzerare).
  { query: "orologi", contiene: [218, 1360] },
  { query: "anelli", contiene: [1361, 1524], esclude: [1430] },
  { query: "cipolle", contiene: [1371, 1509] },
  { query: "tarallini", contiene: [1519] },
  { query: "fileja", contiene: [1513] },
  { query: "strascinati", contiene: [1491] },
  { query: "vino rosso", contiene: [1377] },
  { query: "miele millefiori", contiene: [1374, 1521] },
  // Quantità esplicita soddisfatta: resta il solo olio da un litro.
  { query: "olio evo 1 litro", contiene: [1507], esclude: [1376] },
  { query: "formaggi", contiene: [1508] },
  // Richiesta larga: devono esserci prodotti, ma la risposta è limitata a 6
  // voci dall'orchestratore.
  { query: "qualcosa di tipico da mangiare", contiene: [1371, 1507] },
  { query: "biscotto", contiene: [1512, 1523] },
  // Qualificatore NON documentato: i prodotti del soggetto restano e la
  // risposta dichiara che la qualifica non è confermata.
  { query: "olio dop", contiene: [1376, 1507] },
  { query: "pasta fresca", contiene: [1513, 1517] },
];

let fallite = 0;
const righe = ATTESE.map((attesa) => {
  const esito = esegui(attesa.query);
  const mancanti = (attesa.contiene ?? []).filter((id) => !esito.ids.includes(id));
  const vietati = (attesa.esclude ?? []).filter((id) => esito.ids.includes(id));
  const ok = mancanti.length === 0 && vietati.length === 0 && esito.ammessi > 0;
  if (!ok) fallite += 1;
  return { ...esito, ok, mancanti, vietati };
});

const vuote = righe.filter((r) => r.ammessi === 0).map((r) => r.query);
const totaleProdotti = righe.reduce((n, r) => n + r.ammessi, 0);

console.log("Pino — replay offline sullo snapshot di catalogo");
console.log(`Prodotti: ${prodotti.length} · Richieste: ${righe.length}`);
console.log("");
for (const riga of righe) {
  console.log(
    `${riga.ok ? "OK  " : "FAIL"} ${riga.query.padEnd(24)} piano="${riga.piano}" ammessi=${riga.ammessi} via=${riga.via}` +
      (riga.mancanti.length ? ` mancanti=${riga.mancanti.join(",")}` : "") +
      (riga.vietati.length ? ` vietati=${riga.vietati.join(",")}` : "")
  );
  if (VERBOSE) console.log(`     ids=${riga.ids.join(",")}`);
}
console.log("");
console.log(`Zero risultati: ${vuote.length}/${righe.length}${vuote.length ? ` (${vuote.join(", ")})` : ""}`);
console.log(`Prodotti restituiti in totale: ${totaleProdotti} · media ${(totaleProdotti / righe.length).toFixed(2)}`);
const mediaMs = righe.reduce((n, r) => n + r.ms, 0) / righe.length;
const maxMs = Math.max(...righe.map((r) => r.ms));
console.log(
  `Tempo deterministico (piano + gate, senza rete): media ${mediaMs.toFixed(2)} ms · max ${maxMs.toFixed(2)} ms`
);
console.log(`Attese fallite: ${fallite}/${righe.length}`);

if (fallite > 0) process.exitCode = 1;
if (vuote.length > 0) process.exitCode = 1;
