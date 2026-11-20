/**
 * RADICISCAN — RICERCA WEB MULTIFONTE
 *
 * Copre i casi richiesti: Madeo + Soppressata, produttore senza denominazione,
 * marchio diverso dalla denominazione, prodotto senza certificazione, fonti
 * discordanti, motore non disponibile, pagina non accessibile, duplicati,
 * nessuna fonte dopo query alternative, visualizzazione dei link.
 *
 * Le risposte HTTP sono finte, ma la pipeline è quella reale: parsing,
 * deduplica, classificazione, lettura delle pagine e sintesi A-F.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radiscan = await import("@/lib/radiscan");
const {
  creaRicercaWeb,
  creaRicercaWebGoogle,
  sintetizzaFontiWeb,
  svuotaCacheWeb,
} = radiscan;

// La cache dei risultati è di modulo: ogni caso deve partire da zero.
beforeEach(() => svuotaCacheWeb());

const radice = (percorso) =>
  fileURLToPath(new URL(`../${percorso}`, import.meta.url));

function riconoscimento(override = {}) {
  return {
    prodotto: "Soppressata di Calabria",
    categoria: "Salumi",
    denominazioneProposta: "Soppressata di Calabria DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoreEtichetta: ["DOP"],
    indicatoriEtichetta: ["DOP"],
    confidenza: 85,
    note: null,
    incongruenzeRilevate: [],
    produttore: "Madeo",
    ...override,
  };
}

function risultati(elenco) {
  return `<html><body>${elenco
    .map(
      (voce) =>
        `<a class="result__a" href="/l/?uddg=${encodeURIComponent(voce.url)}">${voce.titolo}</a>` +
        `<div class="result__snippet">${voce.estratto ?? ""}</div>`
    )
    .join("")}</body></html>`;
}

function pagina(titolo, testo) {
  return `<html><head><title>${titolo}</title></head><body><main>${testo}</main></body></html>`;
}

const PAGINE = {
  "https://www.filieramadeo.it/": pagina(
    "Filiera Madeo — salumi di Calabria DOP",
    "Filiera Madeo produce salumi di Calabria DOP, tra cui la Soppressata di Calabria DOP. Azienda di San Demetrio Corone, Cosenza."
  ),
  "https://www.madeobbq.com/prodotto/soppressata-di-calabria-d-o-p-dolce/": pagina(
    "Soppressata di Calabria D.O.P. Dolce - Madeo BBQ",
    "Soppressata di Calabria D.O.P. Dolce prodotta da Madeo. Prodotto certificato DOP."
  ),
  "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241": pagina(
    "MASAF — Soppressata di Calabria DOP",
    "Registro ufficiale delle denominazioni: Soppressata di Calabria DOP, denominazione registrata."
  ),
  "https://www.arsacweb.it/salumi-di-calabria-dop/": pagina(
    "ARSAC — Salumi di Calabria DOP",
    "I salumi di Calabria DOP comprendono la Soppressata di Calabria DOP."
  ),
  "https://www.caseificiorossi.it/": pagina(
    "Caseificio Rossi — Pecorino Romano DOP",
    "Caseificio Rossi produce Pecorino Romano DOP nel Lazio."
  ),
  "https://www.aziendaagricola.it/prodotti": pagina(
    "Azienda Agricola — salame tradizionale",
    "Salame tradizionale senza denominazione di origine certificata."
  ),
};

function fintoFetch({ elenco = [], pagine = PAGINE, statoMotore = 200 } = {}) {
  return async (url) => {
    const testoUrl = String(url);
    if (testoUrl.includes("html.duckduckgo.com")) {
      return new Response(risultati(elenco), {
        status: statoMotore,
        headers: { "content-type": "text/html" },
      });
    }
    if (testoUrl.includes("www.bing.com/search")) {
      return new Response("<html><body></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (testoUrl.includes("it.wikipedia.org/w/api.php")) {
      return new Response(JSON.stringify({ query: { search: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const html = pagine[testoUrl];
    if (html) {
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("", { status: 404 });
  };
}

const RISULTATI_MADEO = [
  {
    titolo: "Filiera Madeo — salumi di Calabria DOP",
    url: "https://www.filieramadeo.it/",
    estratto: "Madeo produce salumi di Calabria DOP.",
  },
  {
    titolo: "Soppressata di Calabria D.O.P. Dolce - Madeo BBQ",
    url: "https://www.madeobbq.com/prodotto/soppressata-di-calabria-d-o-p-dolce/",
    estratto: "Soppressata di Calabria DOP prodotta da Madeo.",
  },
  {
    titolo: "MASAF — Soppressata di Calabria DOP",
    url: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241",
    estratto: "Denominazione registrata.",
  },
  {
    titolo: "ARSAC — Salumi di Calabria DOP",
    url: "https://www.arsacweb.it/salumi-di-calabria-dop/",
    estratto: "Salumi di Calabria DOP.",
  },
];

test("Madeo: query separate, pagine ufficiali e produttore lette, sintesi A-F", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({ elenco: RISULTATI_MADEO }),
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.ok(esito.query.some((query) => /Madeo/i.test(query)));
  assert.ok(esito.query.some((query) => /registro/i.test(query)));
  assert.equal(esito.consultaIl ?? esito.consultataIl, "2026-11-20");

  const filiera = esito.fonti.find((fonte) => fonte.dominio === "www.filieramadeo.it");
  assert.ok(filiera, "la pagina del produttore deve essere recuperata");
  assert.equal(filiera.natura, "produttore");
  assert.equal(filiera.dichiarazione, "aziendale");
  assert.equal(filiera.lettoIntegralmente, true);
  assert.match(filiera.estratto ?? "", /Soppressata di Calabria DOP/);

  const masaf = esito.fonti.find((fonte) => fonte.dominio === "www.masaf.gov.it");
  assert.ok(masaf, "la scheda MASAF deve essere recuperata");
  assert.equal(masaf.natura, "ufficiale_it");
  assert.equal(masaf.lettoIntegralmente, true);

  assert.equal(esito.sintesi.denominazione.stato, "menzionata");
  assert.equal(esito.sintesi.produttore.stato, "dichiarata");
  assert.match(esito.sintesi.produttore.testo, /dichiarazione aziendale/i);
  assert.equal(esito.sintesi.filieraCalabrese.stato, "supportata");
  assert.equal(esito.sintesi.confezione.stato, "non_verificabile");
});

test("produttore senza denominazione: nessuna denominazione inventata", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        {
          titolo: "Caseificio Rossi — Pecorino",
          url: "https://www.caseificiorossi.it/",
          estratto: "Caseificio Rossi produce Pecorino.",
        },
      ],
    }),
  }).cerca({
    riconoscimento: riconoscimento({
      prodotto: "Pecorino",
      denominazioneProposta: null,
      schemaProposto: null,
      produttore: "Caseificio Rossi",
    }),
  });

  assert.equal(esito.sintesi.denominazione.stato, "non_confermata");
  assert.equal(esito.sintesi.produttore.stato, "dichiarata");
  assert.equal(esito.sintesi.marchio.stato, "menzionata");
});

test("prodotto non DOP: filiera calabrese valutata con fonti aziendali e indipendenti", () => {
  const riconoscimentoNonDop = riconoscimento({
    prodotto: "Pecorino Crotonese",
    denominazioneProposta: null,
    schemaProposto: null,
    territorioProposto: "Calabria",
    produttore: "Caseificio del Marchesato",
  });
  const fonti = [
    {
      id: "web:1",
      titolo: "Caseificio del Marchesato — Pecorino Crotonese",
      ente: "caseificiomarchesato.it",
      url: "https://www.caseificiomarchesato.it/pecorino-crotonese",
      dominio: "www.caseificiomarchesato.it",
      natura: "produttore",
      attendibilita: "media",
      consultataIl: "2026-11-20",
      dataDocumento: null,
      estratto: "Il Caseificio del Marchesato produce Pecorino Crotonese e lavora il latte nello stabilimento di Crotone, Calabria.",
      riferimentoNormativo: null,
      pagineLette: null,
      lettoIntegralmente: true,
      metodoLettura: "http",
      relazione: "Pagina letta.",
      dichiarazione: "aziendale",
      rilevanza: "alta",
    },
    {
      id: "web:2",
      titolo: "ARSAC — filiera casearia crotonese",
      ente: "arsacweb.it",
      url: "https://www.arsacweb.it/filiera-casearia-crotonese",
      dominio: "www.arsacweb.it",
      natura: "regionale",
      attendibilita: "alta",
      consultataIl: "2026-11-20",
      dataDocumento: null,
      estratto: "La produzione del Pecorino Crotonese è parte della filiera casearia della Calabria, con lavorazioni nel territorio di Crotone.",
      riferimentoNormativo: null,
      pagineLette: null,
      lettoIntegralmente: true,
      metodoLettura: "http",
      relazione: "Pagina letta.",
      dichiarazione: "indipendente",
      rilevanza: "alta",
    },
  ];

  const sintesi = sintetizzaFontiWeb(riconoscimentoNonDop, fonti);
  assert.equal(sintesi.denominazione.stato, "non_confermata");
  assert.equal(sintesi.filieraCalabrese.stato, "supportata");
  assert.equal(sintesi.confezione.stato, "non_verificabile");
});

test("marchio commerciale diverso dalla denominazione", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        {
          titolo: "Caseificio Rossi — Pecorino Romano DOP",
          url: "https://www.caseificiorossi.it/",
          estratto: "Pecorino Romano DOP.",
        },
      ],
    }),
  }).cerca({
    riconoscimento: riconoscimento({
      prodotto: "Pecorino Romano",
      denominazioneProposta: "Pecorino Romano DOP",
      produttore: "Caseificio Rossi",
    }),
  });

  const prova = [
    {
      id: "eambrosia:IT0001",
      tipo: "ufficiale",
      denominazione: "Pecorino Romano",
      stato: "registrata",
      schemaQualita: "DOP",
      url: "https://ec.europa.eu/example",
    },
  ];
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({
      prodotto: "Pecorino Romano",
      denominazioneProposta: "Pecorino Romano DOP",
      produttore: "Caseificio Rossi",
    }),
    esito.fonti,
    prova
  );

  assert.equal(sintesi.denominazione.stato, "registrata");
  assert.equal(sintesi.produttore.stato, "dichiarata");
  assert.equal(sintesi.marchio.stato, "menzionata");
});

test("prodotto senza certificazione: la ricerca non diventa una verifica negativa", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        {
          titolo: "Azienda Agricola — salame tradizionale",
          url: "https://www.aziendaagricola.it/prodotti",
          estratto: "Salame tradizionale senza certificazione.",
        },
      ],
    }),
  }).cerca({
    riconoscimento: riconoscimento({
      prodotto: "Salame tradizionale",
      denominazioneProposta: null,
      schemaProposto: null,
      produttore: "Azienda Agricola",
    }),
  });

  assert.equal(esito.sintesi.denominazione.stato, "non_confermata");
  assert.match(
    esito.sintesi.denominazione.testo,
    /non dimostra che la denominazione non esista/i
  );
  assert.equal(esito.sintesi.confezione.stato, "non_verificabile");
});

test("fonti ufficiali e aziendali discordanti restano separate", async () => {
  const fonti = [
    {
      id: "web:1",
      titolo: "MASAF — Soppressata di Calabria DOP",
      ente: "www.masaf.gov.it",
      url: "https://www.masaf.gov.it/scheda",
      dominio: "www.masaf.gov.it",
      natura: "ufficiale_it",
      attendibilita: "alta",
      consultataIl: "2026-11-20",
      dataDocumento: null,
      estratto: "Soppressata di Calabria DOP registrata.",
      riferimentoNormativo: null,
      pagineLette: null,
      lettoIntegralmente: true,
      relazione: "Pagina letta.",
      dichiarazione: "indipendente",
      rilevanza: "alta",
    },
    {
      id: "web:2",
      titolo: "Madeo — i nostri prodotti",
      ente: "www.madeobbq.com",
      url: "https://www.madeobbq.com/prodotti",
      dominio: "www.madeobbq.com",
      natura: "produttore",
      attendibilita: "media",
      consultataIl: "2026-11-20",
      dataDocumento: null,
      estratto: "Madeo produce Soppressata di Calabria IGP.",
      riferimentoNormativo: null,
      pagineLette: null,
      lettoIntegralmente: true,
      relazione: "Pagina letta.",
      dichiarazione: "aziendale",
      rilevanza: "alta",
    },
  ];
  const prova = [
    {
      id: "eambrosia:IT0002",
      tipo: "ufficiale",
      denominazione: "Soppressata di Calabria",
      stato: "registrata",
      schemaQualita: "DOP",
      url: "https://ec.europa.eu/example-2",
    },
  ];
  const sintesi = sintetizzaFontiWeb(riconoscimento(), fonti, prova);

  assert.equal(sintesi.denominazione.stato, "registrata");
  assert.equal(sintesi.produttore.stato, "dichiarata");
  assert.match(sintesi.produttore.testo, /non una verifica indipendente/i);
  assert.ok(fonti.every((fonte) => fonte.dichiarazione !== "indipendente" || fonte.natura !== "produttore"));
});

test("motore non disponibile: stato non_disponibile, nessuna fonte inventata", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: async () => {
      throw new Error("rete assente");
    },
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "non_disponibile");
  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non dimostra l'assenza di fonti/i);
});

test("una pagina generica non diventa una fonte del produttore", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        {
          titolo: "Curinga - Wikipedia",
          url: "https://it.wikipedia.org/wiki/Curinga",
          estratto: "Comune della provincia di Catanzaro, in Calabria.",
        },
      ],
    }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non è una prova di assenza/i);
});

test("pagina non accessibile: la fonte resta un risultato, non un documento letto", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        {
          titolo: "Scheda prodotto Madeo",
          url: "https://www.madeobbq.com/prodotto/soppressata",
          estratto: "Soppressata di Calabria DOP.",
        },
      ],
    }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  const fonte = esito.fonti.find((voce) => voce.url.includes("madeobbq.com"));
  assert.ok(fonte);
  assert.equal(fonte.lettoIntegralmente, false);
  assert.equal(fonte.pagineLette, null);
  assert.match(fonte.estratto ?? "", /Soppressata/);
});

test("risultati duplicati: ogni URL compare una sola volta", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({
      elenco: [
        RISULTATI_MADEO[0],
        RISULTATI_MADEO[0],
        RISULTATI_MADEO[1],
      ],
    }),
  }).cerca({ riconoscimento: riconoscimento() });

  const url = esito.fonti.map((fonte) => fonte.url);
  assert.equal(new Set(url).size, url.length);
});

test("nessuna fonte dopo query alternative: esito dichiarato, non prova di assenza", async () => {
  const esito = await creaRicercaWeb({
    fetchImpl: fintoFetch({ elenco: [] }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non è una prova di assenza/i);
});

test("Google grounding: usa gli URL restituiti da Google e legge le pagine", async () => {
  const fetchImpl = async (url) => {
    const testoUrl = String(url);
    if (testoUrl.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              groundingMetadata: {
                webSearchQueries: ["Madeo Soppressata di Calabria DOP"],
                groundingChunks: [
                  {
                    web: {
                      uri: "https://www.filieramadeo.it/",
                      title: "Filiera Madeo",
                    },
                  },
                  {
                    web: {
                      uri: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241",
                      title: "MASAF — Soppressata di Calabria DOP",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return fintoFetch({ elenco: RISULTATI_MADEO })(url);
  };

  const esito = await creaRicercaWebGoogle({
    apiKey: "chiave-di-test",
    modelli: ["modello-di-test"],
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.motore, "google_grounding");
  assert.ok(esito.fonti.some((fonte) => fonte.url === "https://www.filieramadeo.it/"));
  assert.ok(esito.fonti.some((fonte) => fonte.dominio === "www.masaf.gov.it"));
  assert.ok(esito.fonti.every((fonte) => !fonte.url.includes("google")));
});

test("Google grounding non disponibile: fallback keyless dichiarato", async () => {
  const esito = await creaRicercaWebGoogle({
    apiKey: "chiave-di-test",
    modelli: ["modello-di-test"],
    fetchImpl: async (url) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response("{}", { status: 429 });
      }
      return fintoFetch({ elenco: [] })(url);
    },
  }).cerca({ riconoscimento: riconoscimento() });

  assert.notEqual(esito.motore, "google_grounding");
  assert.equal(esito.stato, "ok");
});

test("UI: sezione FONTI TROVATE, sei verifiche e link apribili", () => {
  const sorgente = readFileSync(
    radice("components/radiscan/ScanRisultato.tsx"),
    "utf8"
  );
  assert.match(sorgente, /FONTI TROVATE/);
  assert.match(sorgente, /BloccoSintesiFonti/);
  assert.match(sorgente, /A\. Denominazione DOP\/IGP registrata/);
  assert.match(sorgente, /E\. Filiera calabrese: origine e produzione/);
  assert.match(sorgente, /F\. Autenticità della singola confezione e del lotto/);
  assert.match(sorgente, /target="_blank"/);
  assert.match(sorgente, /rel="noopener noreferrer"/);
});
