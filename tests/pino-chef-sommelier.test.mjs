import assert from "node:assert/strict";
import test from "node:test";
import {
  VINI_CALABRESI_AMMESSI,
  VINI_NON_CALABRESI_PINO,
} from "../lib/assistente/abbinamenti-vino.ts";
import {
  bloccoChefSommelierPino,
  consiglioChefRapidoPino,
  richiestaCucinaPino,
  rispostaChefSommelierPino,
  schedaCucinaPino,
  terminiRicercaProdottoCucinaPino,
  terminiRicercaVinoCucinaPino,
  viniCucinaPino,
} from "../lib/assistente/chef-sommelier.ts";
import { buildFinalPrompt, buildToolSelectionPrompt } from "../lib/assistente/prompt.ts";
import { moodDaRispostaPino } from "../components/assistant/pino-fetch.ts";

/**
 * Chef e sommelier della cucina calabrese:
 * - le domande su ricette e cottura vengono riconosciute;
 * - ogni prodotto tipico ha ricette calabresi e un consiglio di cottura;
 * - il vino indicato è sempre e solo calabrese;
 * - le schede del catalogo compaiono con prezzo e link;
 * - la risposta resta ALLEGRO, anche senza schede.
 */

const normalizza = (testo) => testo.toLowerCase().replace(/[’‘`´]/g, "'");

const vinoCalabrese = (vino) =>
  VINI_CALABRESI_AMMESSI.includes(normalizza(vino));

const FRASI_NEGATIVE = [
  /non ho trovato/i,
  /non risulta/i,
  /nessun risultato/i,
  /nessuna attivit[àa]/i,
  /nessun negozio/i,
  /nessun prodotto/i,
  /non ci sono/i,
];

const rispostaFinta = (testo, extra = {}) => ({
  risposta: testo,
  negozi: [],
  prodotti: [],
  risultatiTrovati: 0,
  ricercaEseguita: true,
  processingMs: 10,
  source: "assistente",
  ...extra,
});

const PRODOTTI = [
  ["come cucinare la 'nduja", /Nduja/],
  ["come si cucina la cipolla di Tropea?", /Cipolla Rossa di Tropea/],
  ["ricetta con il caciocavallo silano", /Caciocavallo Silano/],
  ["come usare la soppressata calabrese", /Soppressata/],
  ["come preparare la sardella", /Sardella/],
  ["come usare i peperoni cruschi", /Peperoni cruschi/],
  ["come cucinare lo stocco di Mammola", /Stocco/],
  ["ricetta con il pecorino crotonese", /Pecorino Crotonese/],
  ["come usare il bergamotto", /Bergamotto/],
  ["ricetta con la liquirizia di Rossano", /Liquirizia/],
  ["come usare il tartufo del Pollino", /Tartufo/],
  ["ricetta con i fichi di Cosenza", /Fichi di Cosenza/],
  ["come cucinare i funghi della Sila", /Funghi della Sila/],
];

test("riconosce le domande di cucina e cottura", () => {
  const domande = [
    "come cucinare la nduja",
    "come si cucina la cipolla di Tropea?",
    "ricetta con i peperoni cruschi",
    "come usare lo stocco di Mammola",
    "cosa preparare con il caciocavallo silano",
    "piatti con la soppressata",
    "come cuocere il tartufo del Pollino",
  ];
  for (const domanda of domande) {
    assert.equal(richiestaCucinaPino(domanda), true, domanda);
  }
});

test("le domande non di cucina restano fuori dal ramo chef", () => {
  const domande = [
    "come si usa il sito?",
    "negozi a Cosenza",
    "cipolla di Tropea",
    "vino per la 'nduja",
    "che cos'è Radici Calabria?",
    "quanto costa la 'nduja",
  ];
  for (const domanda of domande) {
    assert.equal(richiestaCucinaPino(domanda), false, domanda);
  }
});

test("ogni prodotto tipico ha ricette, consiglio e vini calabresi", () => {
  for (const [domanda, atteso] of PRODOTTI) {
    const scheda = schedaCucinaPino(domanda);
    assert.ok(scheda, domanda);
    assert.match(scheda.prodotto, atteso, domanda);
    assert.ok(scheda.ricette.length >= 2, domanda);
    for (const ricetta of scheda.ricette) {
      assert.ok(ricetta.nome.length > 0, domanda);
      assert.ok(ricetta.preparazione.length > 0, domanda);
    }
    assert.ok(scheda.consiglio.length > 20, domanda);
    assert.ok(scheda.vini.length > 0, domanda);
    for (const vino of scheda.vini) {
      assert.equal(vinoCalabrese(vino), true, `${domanda}: ${vino}`);
    }
  }
});

test("nessun vino di altre regioni compare nelle schede di cucina", () => {
  for (const [domanda] of PRODOTTI) {
    const vini = viniCucinaPino(domanda).join(" ").toLowerCase();
    for (const vietato of VINI_NON_CALABRESI_PINO) {
      assert.equal(vini.includes(vietato), false, `${domanda}: ${vietato}`);
    }
  }
});

test("«come cucinare la nduja»: ricette, cottura e Magliocco", () => {
  const scheda = schedaCucinaPino("come cucinare la nduja");
  assert.ok(scheda);
  assert.match(scheda.prodotto, /Nduja di Spilinga/);
  assert.equal(scheda.ricette.length, 3);
  assert.ok(scheda.ricette.some((r) => /fileja/i.test(r.nome)));
  assert.match(scheda.consiglio, /fuoco dolce/i);
  assert.ok(scheda.vini.includes("Magliocco"));
  assert.ok(scheda.vini.includes("Cirò Rosso"));
  assert.deepEqual(terminiRicercaProdottoCucinaPino("come cucinare la nduja"), [
    "nduja",
  ]);
  assert.ok(terminiRicercaVinoCucinaPino("come cucinare la nduja").includes("magliocco"));
});

test("«ricette con la cipolla di Tropea»: tre ricette e vini freschi", () => {
  const scheda = schedaCucinaPino("ricette con la cipolla di Tropea");
  assert.ok(scheda);
  assert.equal(scheda.ricette.length, 3);
  assert.ok(scheda.vini.includes("Cirò Bianco"));
  assert.ok(scheda.vini.includes("Cirò Rosato"));
  assert.ok(scheda.vini.every(vinoCalabrese));
});

test("«come usare i peperoni cruschi»: ricette calabresi e vino", () => {
  const scheda = schedaCucinaPino("come usare i peperoni cruschi");
  assert.ok(scheda);
  assert.match(scheda.prodotto, /Peperoni cruschi/);
  assert.ok(scheda.ricette.some((r) => /mollica/i.test(r.nome)));
  assert.ok(scheda.vini.includes("Cirò Bianco"));
  assert.ok(scheda.vini.every(vinoCalabrese));
});

test("la risposta da chef mostra ricette, cottura, vino e schede del catalogo", () => {
  const risposta = rispostaChefSommelierPino(
    "come cucinare la nduja",
    [
      {
        nome: "'Nduja di Spilinga",
        slug: "nduja-spilinga",
        prezzo: 8.5,
        negozio: "Bottega di Spilinga",
      },
    ],
    [
      {
        nome: "Vino Magliocco del Pollino",
        slug: "magliocco-pollino",
        prezzo: 14.9,
        negozio: "Enoteca del Pollino",
      },
      // Un prodotto che non è un vino non va presentato come etichetta.
      { nome: "Marmellone Rosso", slug: "marmellone", prezzo: 15, negozio: "Enoteca" },
    ]
  );
  assert.ok(risposta);
  assert.match(risposta, /\*\*Da chef\*\*/);
  assert.match(risposta, /Fileja con la 'nduja/);
  assert.match(risposta, /\*\*Consiglio di cottura:\*\*/);
  assert.match(risposta, /fuoco dolce/i);
  assert.match(risposta, /\*\*Da sommelier:\*\*/);
  assert.match(risposta, /Magliocco/);
  assert.match(risposta, /\[Vino Magliocco del Pollino\]\(\/prodotto\/magliocco-pollino\)/);
  assert.match(risposta, /€14,90/);
  assert.match(risposta, /\[(?:'|&#39;)?Nduja di Spilinga\]\(\/prodotto\/nduja-spilinga\)/);
  assert.match(risposta, /€8,50/);
  assert.equal(risposta.includes("Marmellone"), false);
});

test("senza schede la risposta da chef resta utile e non dichiara esiti negativi", () => {
  const risposta = rispostaChefSommelierPino("come cucinare la nduja");
  assert.ok(risposta);
  assert.match(risposta, /Fileja con la 'nduja/);
  for (const frase of FRASI_NEGATIVE) {
    assert.equal(frase.test(risposta), false, frase.source);
  }
  assert.equal(moodDaRispostaPino(rispostaFinta(risposta), "come cucinare la nduja"), "happy");
});

test("con le schede del catalogo la risposta resta ALLEGRO", () => {
  const risposta = rispostaChefSommelierPino(
    "ricette con la cipolla di Tropea",
    [
      {
        nome: "Cipolla Rossa di Tropea IGP",
        slug: "cipolla-tropea",
        prezzo: 3.2,
        negozio: "Bottega del Pollino",
      },
    ]
  );
  assert.ok(risposta);
  assert.match(risposta, /\/prodotto\/cipolla-tropea/);
  assert.equal(
    moodDaRispostaPino(
      rispostaFinta(risposta, { prodotti: [{ id: 1 }], risultatiTrovati: 1 }),
      "ricette con la cipolla di Tropea"
    ),
    "happy"
  );
});

test("un prodotto fuori elenco riceve comunque una risposta di cucina calabrese", () => {
  const risposta = rispostaChefSommelierPino("come cucinare il capretto");
  assert.ok(risposta);
  assert.match(risposta, /Da chef/);
  assert.match(risposta, /Soffritto calabrese/);
  assert.match(risposta, /quale prodotto tipico/i);
  for (const frase of FRASI_NEGATIVE) {
    assert.equal(frase.test(risposta), false, frase.source);
  }
  assert.equal(
    moodDaRispostaPino(rispostaFinta(risposta), "come cucinare il capretto"),
    "happy"
  );
});

test("il consiglio rapido da chef accompagnna anche la sola domanda di vino", () => {
  const vino = consiglioChefRapidoPino("vino per la 'nduja");
  assert.ok(vino);
  assert.match(vino, /consiglio da chef/i);
  assert.match(vino, /Fileja|'nduja/);

  const formaggio = consiglioChefRapidoPino("abbinamento caciocavallo silano");
  assert.ok(formaggio);
  assert.match(formaggio, /consiglio da chef/i);

  assert.equal(consiglioChefRapidoPino("negozi a Cosenza"), null);
});

test("il blocco prompt di cucina impone ricette e soli vini calabresi", () => {
  const blocco = bloccoChefSommelierPino("come cucinare la nduja");
  assert.match(blocco, /CUCINA E VINO/);
  assert.match(blocco, /Nduja di Spilinga/);
  assert.match(blocco, /Consiglio di cottura/);
  assert.match(blocco, /Magliocco/);
  assert.match(blocco, /non ho trovato/);

  const fuoriElenco = bloccoChefSommelierPino("come cucinare il capretto");
  assert.match(fuoriElenco, /non è nell'elenco/);

  assert.equal(bloccoChefSommelierPino("negozi a Cosenza"), "");
});

test("i prompt del planner e della risposta finale includono la cucina", () => {
  const messaggi = [{ role: "user", content: "come cucinare la nduja" }];
  const planner = buildToolSelectionPrompt(messaggi);
  assert.match(planner, /CUCINA CALABRESE/);
  assert.match(planner, /nduja/);

  const finale = buildFinalPrompt(messaggi, "=== DATI RECUPERATI ===");
  assert.match(finale, /CUCINA E VINO DELLA TRADIZIONE CALABRESE/);
  assert.match(finale, /Da sommelier|solo vini e vitigni autoctoni calabresi/i);

  const altroFinale = buildFinalPrompt(
    [{ role: "user", content: "negozi a Cosenza" }],
    "=== DATI RECUPERATI ==="
  );
  assert.equal(/CUCINA E VINO DELLA TRADIZIONE/.test(altroFinale), false);
});
