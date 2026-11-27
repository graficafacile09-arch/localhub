import assert from "node:assert/strict";
import test from "node:test";
import {
  VINI_CALABRESI_AMMESSI,
  VINI_NON_CALABRESI_PINO,
  abbinamentoVinoPino,
  bloccoAbbinamentoVinoPino,
  richiestaAbbinamentoVinoPino,
  rispostaAbbinamentoVinoPino,
  terminiRicercaViniPino,
} from "../lib/assistente/abbinamenti-vino.ts";
import { buildFinalPrompt, buildToolSelectionPrompt } from "../lib/assistente/prompt.ts";
import { moodDaRispostaPino } from "../components/assistant/pino-fetch.ts";

/**
 * Sommelier della filiera calabrese:
 * - la domanda di abbinamento viene riconosciuta (planner e risposta finale);
 * - il prodotto tipico determina piatto e vitigni, sempre e solo calabresi;
 * - la ricerca usa i vitigni come termini;
 * - la risposta resta ALLEGRO anche senza schede strutturate.
 */

const normalizza = (testo) => testo.toLowerCase().replace(/[’‘`´]/g, "'");

const vinoCalabrese = (vino) => VINI_CALABRESI_AMMESSI.includes(normalizza(vino));

test("riconosce le domande di abbinamento cibo-vino", () => {
  const domande = [
    "con che vino abbino la cipolla di Tropea?",
    "vino per la 'nduja",
    "abbinamento caciocavallo silano",
    "che vino bere con il pesce spada?",
    "quale vino mi consigli con il pecorino crotonese?",
    "cipolla di Tropea e vino?",
  ];
  for (const domanda of domande) {
    assert.equal(richiestaAbbinamentoVinoPino(domanda), true, domanda);
  }
});

test("una ricerca di vini non è un abbinamento", () => {
  const domande = [
    "un vino rosso calabrese",
    "vendete vino?",
    "negozi a Cosenza",
    "cipolla di Tropea",
    "che vino rosso avete in catalogo",
  ];
  for (const domanda of domande) {
    assert.equal(richiestaAbbinamentoVinoPino(domanda), false, domanda);
  }
});

test("Cipolla di Tropea: piatto contestualizzato e vini freschi calabresi", () => {
  const abbinamento = abbinamentoVinoPino("con che vino abbino la cipolla di Tropea?");
  assert.ok(abbinamento);
  assert.match(abbinamento.prodotto, /Cipolla Rossa di Tropea/);
  assert.equal(abbinamento.categoria, "ortaggi");
  assert.ok(abbinamento.piatti.some((p) => /insalata|frittata|agrodolce/i.test(p)));
  assert.ok(abbinamento.vini.includes("Cirò Bianco"));
  assert.ok(abbinamento.vini.includes("Cirò Rosato"));
  assert.ok(abbinamento.vini.every(vinoCalabrese));
});

test("'Nduja: piatti saporiti e vitigni rossi autoctoni", () => {
  const abbinamento = abbinamentoVinoPino("che vino bevo con la 'nduja?");
  assert.ok(abbinamento);
  assert.match(abbinamento.prodotto, /Nduja/);
  assert.equal(abbinamento.categoria, "salumi");
  assert.ok(abbinamento.piatti.some((p) => /bruschetta|sugo|pizza/i.test(p)));
  assert.ok(abbinamento.vini.includes("Magliocco"));
  assert.ok(abbinamento.vini.includes("Gaglioppo"));
  assert.ok(abbinamento.vini.every(vinoCalabrese));
});

test("Caciocavallo Silano: formaggio stagionato con Greco di Bianco e Mantonico", () => {
  const abbinamento = abbinamentoVinoPino("abbinamento caciocavallo silano");
  assert.ok(abbinamento);
  assert.match(abbinamento.prodotto, /Caciocavallo Silano/);
  assert.equal(abbinamento.categoria, "formaggi");
  assert.ok(abbinamento.piatti.some((p) => /piastra|tagliere|forno/i.test(p)));
  assert.ok(abbinamento.vini.includes("Greco di Bianco"));
  assert.ok(abbinamento.vini.includes("Mantonico"));
  assert.ok(abbinamento.vini.every(vinoCalabrese));
});

test("nessun vino di altre regioni in tutta la tabella", () => {
  const domande = [
    "cipolla di Tropea",
    "nduja",
    "soppressata",
    "caciocavallo silano",
    "pecorino crotonese",
    "conserve sott'olio",
    "pesce spada",
    "dolci tipici",
  ];
  for (const domanda of domande) {
    const blocco = normalizza(bloccoAbbinamentoVinoPino(domanda));
    for (const vino of VINI_NON_CALABRESI_PINO) {
      assert.equal(blocco.includes(vino), false, `${domanda}: ${vino}`);
    }
  }
});

test("termini di ricerca: vitigni del prodotto, altrimenti i vitigni autoctoni", () => {
  assert.ok(terminiRicercaViniPino("vino per la 'nduja").includes("magliocco"));
  assert.ok(terminiRicercaViniPino("vino per il pesce spada").includes("greco bianco"));
  const generici = terminiRicercaViniPino("che vino bere?");
  assert.ok(generici.includes("gaglioppo"));
  assert.ok(generici.includes("cirò"));
});

test("il blocco impone vini calabresi e vieta le frasi di esito negativo", () => {
  const blocco = bloccoAbbinamentoVinoPino("vino per la 'nduja");
  assert.match(blocco, /SOLO vini e vitigni autoctoni calabresi/);
  assert.match(blocco, /'Nduja di Spilinga/);
  assert.match(blocco, /«non ho trovato»/);
  assert.equal(bloccoAbbinamentoVinoPino("negozi a Cosenza"), "");
});

test("il planner manda l'abbinamento su searchProducts con i vitigni del prodotto", () => {
  const prompt = buildToolSelectionPrompt([
    { role: "user", content: "vino per la 'nduja" },
  ]);
  assert.match(prompt, /ABBINAMENTO CIBO-VINO CALABRESE/);
  assert.match(prompt, /searchProducts/);
  assert.match(prompt, /magliocco/i);
  assert.match(prompt, /solo calabresi/i);
});

test("la risposta finale riceve piatto, vitigni e vincolo calabrese", () => {
  const prompt = buildFinalPrompt(
    [{ role: "user", content: "con che vino abbino la cipolla di Tropea?" }],
    "CONTESTO DI PROVA"
  );
  assert.match(prompt, /Cipolla Rossa di Tropea IGP/);
  assert.match(prompt, /insalata/);
  assert.match(prompt, /Cirò Bianco/);
  assert.match(prompt, /autoctoni/);
  // La domanda non di abbinamento non deve ricevere il blocco.
  const normale = buildFinalPrompt([{ role: "user", content: "negozi a Cosenza" }], "CONTESTO");
  assert.equal(normale.includes("ABBINAMENTO CIBO-VINO CALABRESE"), false);
});

test("risposta da sommelier con solo testo: Pino resta ALLEGRO", () => {
  const risposta = {
    risposta:
      "La Cipolla Rossa di Tropea si usa cruda in insalata o caramellata sui formaggi. Con l'insalata e i piatti agrodolci il Cirò Bianco è la scelta giusta, mentre il Cirò Rosato regge la frittata.",
    negozi: [],
    prodotti: [],
    risultatiTrovati: 0,
    ricercaEseguita: true,
    processingMs: 10,
    source: "assistente",
  };
  assert.equal(moodDaRispostaPino(risposta, "con che vino abbino la cipolla di Tropea?"), "happy");
});

const PRODOTTI_ABBINAMENTO = [
  ["con che vino abbino la cipolla di Tropea?", /Cipolla Rossa di Tropea IGP/, /insalata/i, /Cirò Bianco/],
  ["vino per la 'nduja", /'Nduja di Spilinga/, /bruschetta|sugo|pizza/i, /Magliocco/],
  ["abbinamento caciocavallo silano", /Caciocavallo Silano DOP/, /piastra|tagliere|forno/i, /Greco di Bianco/],
];

test("la risposta dedicata contestualizza il piatto e propone vini calabresi", () => {
  for (const [domanda, prodotto, piatto, vino] of PRODOTTI_ABBINAMENTO) {
    const risposta = rispostaAbbinamentoVinoPino(domanda);
    assert.ok(risposta, domanda);
    assert.match(risposta, prodotto, domanda);
    assert.match(risposta, piatto, domanda);
    assert.match(risposta, vino, domanda);
    const testo = normalizza(risposta);
    for (const straniero of VINI_NON_CALABRESI_PINO) {
      assert.equal(testo.includes(straniero), false, `${domanda}: ${straniero}`);
    }
    for (const formula of ["non ho trovato", "non risultano", "nessun risultato"]) {
      assert.equal(testo.includes(formula), false, `${domanda}: ${formula}`);
    }
  }
});

test("la risposta dedicata mostra le etichette reali del catalogo", () => {
  const risposta = rispostaAbbinamentoVinoPino("vino per la 'nduja", [
    {
      nome: "Vino Magliocco del Pollino",
      slug: "magliocco-pollino",
      prezzo: 14.9,
      negozio: "Enoteca del Pollino",
    },
    // Un prodotto che non è un vino non va presentato come etichetta.
    { nome: "Marmellone Rosso", slug: "marmellone", prezzo: 15, negozio: "Enoteca" },
  ]);
  assert.ok(risposta);
  assert.match(risposta, /\[Vino Magliocco del Pollino\]\(\/prodotto\/magliocco-pollino\)/);
  assert.match(risposta, /€14,90/);
  assert.match(risposta, /Enoteca del Pollino/);
  assert.equal(risposta.includes("Marmellone"), false);
});

test("senza etichette nel catalogo la risposta resta utile e ALLEGRO", () => {
  const testo = rispostaAbbinamentoVinoPino("abbinamento caciocavallo silano");
  assert.ok(testo);
  assert.match(testo, /Caciocavallo Silano DOP/);
  assert.match(testo, /Greco di Bianco/);
  assert.match(testo, /etichette di questo vino non sono ancora presenti/);
  const risposta = {
    risposta: testo,
    negozi: [],
    prodotti: [],
    risultatiTrovati: 0,
    ricercaEseguita: true,
    processingMs: 10,
    source: "assistente",
  };
  assert.equal(moodDaRispostaPino(risposta, "abbinamento caciocavallo silano"), "happy");
});

test("risposta da sommelier con etichette del catalogo: ALLEGRO", () => {
  const risposta = {
    risposta: "Nel catalogo trovi il Vino Magliocco del Pollino, perfetto con la 'nduja.",
    negozi: [],
    prodotti: [{ id: 1, nome: "Vino Magliocco del Pollino" }],
    risultatiTrovati: 1,
    ricercaEseguita: true,
    processingMs: 10,
    source: "assistente",
  };
  assert.equal(moodDaRispostaPino(risposta, "vino per la 'nduja"), "happy");
});
