/**
 * RADICISCAN — TAVILY SEARCH
 *
 * Verifica l'adapter isolato: configurazione assente, query separate, lettura
 * delle pagine, deduplica, fallback, errori parziali e assenza di risultati.
 * Le risposte HTTP sono finte, ma il percorso è quello reale.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radiscan = await import("@/lib/radiscan");
const {
  costruisciQueryTavily,
  creaRicercaWebTavily,
  sintetizzaFontiWeb,
  svuotaCacheTavily,
} = radiscan;

beforeEach(() => svuotaCacheTavily());

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

function pagina(titolo, testo) {
  return `<html><head><title>${titolo}</title></head><body><main>${testo}</main></body></html>`;
}

const PAGINE = {
  "https://www.filieramadeo.it/": pagina(
    "Filiera Madeo — salumi di Calabria DOP",
    "Filiera Madeo produce salumi di Calabria DOP, tra cui la Soppressata di Calabria DOP. Azienda di San Demetrio Corone, Cosenza."
  ),
  "https://www.filieramadeo.it/salumi-di-calabria-dop/": pagina(
    "Salumi di Calabria DOP — Filiera Madeo",
    "La linea Filiera Madeo comprende la Soppressata di Calabria DOP e altri salumi certificati."
  ),
  "https://www.madeobbq.com/prodotto/soppressata-di-calabria-d-o-p-dolce/":
    pagina(
      "Soppressata di Calabria D.O.P. Dolce - Madeo BBQ",
      "Soppressata di Calabria D.O.P. Dolce prodotta da Madeo. Prodotto certificato DOP."
    ),
  "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241":
    pagina(
      "MASAF — Soppressata di Calabria DOP",
      "Registro ufficiale delle denominazioni: Soppressata di Calabria DOP, denominazione registrata."
    ),
  "https://www.arsacweb.it/salumi-di-calabria-dop/": pagina(
    "ARSAC — Salumi di Calabria DOP",
    "I salumi di Calabria DOP comprendono la Soppressata di Calabria DOP."
  ),
  "https://www.rina.org/it/agroqualita/prodotti-tipici/prodotti-tipici-dop":
    pagina(
      "RINA Agroqualità — prodotti tipici DOP",
      "RINA Agroqualità opera come organismo di controllo e certificazione per i prodotti DOP e IGP."
    ),
};

const RISULTATI = [
  {
    title: "Filiera Madeo — salumi di Calabria DOP",
    url: "https://www.filieramadeo.it/",
    content: "Madeo produce salumi di Calabria DOP, tra cui la Soppressata di Calabria DOP.",
    score: 0.96,
    published_date: "2026-11-01",
  },
  {
    title: "Salumi di Calabria DOP — Filiera Madeo",
    url: "https://www.filieramadeo.it/salumi-di-calabria-dop/",
    content: "La linea comprende la Soppressata di Calabria DOP.",
    score: 0.93,
  },
  {
    title: "Soppressata di Calabria D.O.P. Dolce - Madeo BBQ",
    url: "https://www.madeobbq.com/prodotto/soppressata-di-calabria-d-o-p-dolce/",
    content: "Soppressata di Calabria DOP prodotta da Madeo.",
    score: 0.91,
  },
  {
    title: "MASAF — Soppressata di Calabria DOP",
    url: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/20241",
    content: "Denominazione registrata nel registro ufficiale.",
    score: 0.88,
  },
  {
    title: "ARSAC — Salumi di Calabria DOP",
    url: "https://www.arsacweb.it/salumi-di-calabria-dop/",
    content: "I salumi di Calabria DOP comprendono la Soppressata di Calabria DOP.",
    score: 0.84,
  },
  {
    title: "RINA Agroqualità — prodotti tipici DOP",
    url: "https://www.rina.org/it/agroqualita/prodotti-tipici/prodotti-tipici-dop",
    content: "Organismo di controllo e certificazione per prodotti DOP e IGP.",
    score: 0.72,
  },
];

function rispostaTavily(results) {
  return new Response(
    JSON.stringify({
      results,
      usage: { credits: 1 },
      request_id: "req-test",
      response_time: 0.1,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function fintoFetch({
  risultatiPerQuery = {},
  statusPerQuery = {},
  pagine = PAGINE,
  estrattoPerUrl = {},
} = {}) {
  const chiamateTavily = [];
  const chiamateExtract = [];
  const fetchImpl = async (url, init = {}) => {
    const testoUrl = String(url);
    if (testoUrl === "https://api.tavily.com/extract") {
      const corpo = JSON.parse(String(init.body ?? "{}"));
      const urls = Array.isArray(corpo.urls) ? corpo.urls : [];
      chiamateExtract.push({ urls, authorization: init.headers?.Authorization });
      return new Response(
        JSON.stringify({
          results: urls.map((voce) => ({
            url: voce,
            raw_content: estrattoPerUrl[voce] ?? "",
          })),
          failed_results: [],
          usage: { credits: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (testoUrl === "https://api.tavily.com/search") {
      const corpo = JSON.parse(String(init.body ?? "{}"));
      chiamateTavily.push({
        query: corpo.query,
        authorization: init.headers?.Authorization,
        body: corpo,
      });
      const stato = statusPerQuery[corpo.query] ?? 200;
      if (stato !== 200) {
        return new Response(JSON.stringify({ detail: "errore di prova" }), {
          status: stato,
          headers: { "content-type": "application/json" },
        });
      }
      return rispostaTavily(risultatiPerQuery[corpo.query] ?? RISULTATI);
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
  return { fetchImpl, chiamateTavily, chiamateExtract };
}

test("Tavily non configurato: nessuna chiamata e nessun risultato simulato", async () => {
  let chiamate = 0;
  const esito = await creaRicercaWebTavily({
    apiKey: "",
    fetchImpl: async () => {
      chiamate += 1;
      return new Response("{}", { status: 200 });
    },
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "non_disponibile");
  assert.equal(esito.motore, "tavily");
  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non configurato/i);
  assert.equal(chiamate, 0);
});

test("Tavily: quattro query mirate, pagine ufficiali lette e metadati conservati", async () => {
  const query = costruisciQueryTavily(riconoscimento());
  const risultatiPerQuery = Object.fromEntries(
    query.map((voce) => [voce, RISULTATI.slice(0, 5)])
  );
  // La ricerca mirata agli organismi di controllo è la quarta query.
  risultatiPerQuery[query[3]] = [RISULTATI[5], ...RISULTATI.slice(0, 4)];
  const { fetchImpl, chiamateTavily } = fintoFetch({ risultatiPerQuery });
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.equal(esito.motore, "tavily");
  assert.equal(esito.consultataIl, "2026-11-20");
  assert.equal(esito.consumi.creditiRicerca, 4);
  assert.equal(esito.consumi.creditiTotali, 4);
  assert.equal(esito.query.length, 4);
  assert.ok(esito.query.some((voce) => /Madeo/i.test(voce)));
  assert.ok(esito.query.some((voce) => /Madeo sito ufficiale prodotti catalogo/i.test(voce)));
  assert.ok(esito.query.some((query) => /ARSAC RINA/i.test(query)));
  assert.ok(esito.query.some((query) => /ARSAC RINA organismo/i.test(query)));
  assert.ok(
    chiamateTavily.some((chiamata) =>
      Array.isArray(chiamata.body.include_domains) &&
      chiamata.body.include_domains.includes("arsacweb.it") &&
      chiamata.body.include_domains.includes("rina.org")
    )
  );

  assert.equal(chiamateTavily.length, 4);
  assert.ok(chiamateTavily.every((chiamata) => chiamata.body.search_depth === "fast"));
  assert.ok(
    chiamateTavily.every(
      (chiamata) => chiamata.authorization === "Bearer chiave-di-test"
    ),
    "la chiave deve essere inviata solo nell'header Authorization"
  );
  assert.ok(
    chiamateTavily.every((chiamata) => !String(chiamata.body).includes("chiave-di-test"))
  );

  const domini = new Set(esito.fonti.map((fonte) => fonte.dominio));
  for (const dominio of [
    "www.filieramadeo.it",
    "www.madeobbq.com",
    "www.masaf.gov.it",
    "www.arsacweb.it",
    "www.rina.org",
  ]) {
    assert.ok(domini.has(dominio), `fonte mancante: ${dominio}`);
  }

  const filiera = esito.fonti.find(
    (fonte) => fonte.dominio === "www.filieramadeo.it" && fonte.url.endsWith("/")
  );
  assert.ok(filiera);
  assert.equal(filiera.natura, "produttore");
  assert.equal(filiera.dichiarazione, "aziendale");
  assert.equal(filiera.lettoIntegralmente, true);
  assert.equal(filiera.dataDocumento, "2026-11-01");
  assert.match(filiera.estratto ?? "", /Soppressata di Calabria DOP/);

  const masaf = esito.fonti.find((fonte) => fonte.dominio === "www.masaf.gov.it");
  assert.ok(masaf);
  assert.equal(masaf.natura, "ufficiale_it");
  assert.equal(masaf.lettoIntegralmente, true);

  const rina = esito.fonti.find((fonte) => fonte.dominio === "www.rina.org");
  assert.ok(rina);
  assert.equal(rina.natura, "certificazione");
  assert.equal(rina.lettoIntegralmente, true);

  const prova = [
    {
      id: "eambrosia:IT0001",
      tipo: "ufficiale",
      denominazione: "Soppressata di Calabria",
      stato: "registrata",
      schemaQualita: "DOP",
      url: "https://ec.europa.eu/example",
    },
  ];
  const sintesi = sintetizzaFontiWeb(riconoscimento(), esito.fonti, prova);
  assert.equal(sintesi.denominazione.stato, "registrata");
  assert.equal(sintesi.produttore.stato, "dichiarata");
  assert.equal(sintesi.marchio.stato, "menzionata");
  assert.equal(sintesi.prodotto.stato, "menzionata");
  assert.equal(sintesi.filieraCalabrese.stato, "supportata");
  assert.equal(sintesi.confezione.stato, "non_verificabile");
});

test("Tavily Extract recupera una pagina bloccata al lettore HTTP", async () => {
  const pagine = { ...PAGINE };
  const home = "https://www.filieramadeo.it/";
  const prodotto =
    "https://www.madeobbq.com/prodotto/soppressata-di-calabria-d-o-p-dolce/";
  delete pagine[home];
  delete pagine[prodotto];
  const { fetchImpl, chiamateExtract } = fintoFetch({
    pagine,
    estrattoPerUrl: {
      [home]:
        "Filiera Madeo produce salumi di Calabria DOP, tra cui la Soppressata di Calabria DOP. Madeo è il produttore.",
      [prodotto]:
        "Soppressata di Calabria D.O.P. prodotta da Salumificio Madeo S.r.l.",
    },
  });

  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(chiamateExtract.length, 1);
  assert.ok(chiamateExtract[0].urls.includes(home));
  assert.ok(chiamateExtract[0].urls.includes(prodotto));
  assert.equal(chiamateExtract[0].authorization, "Bearer chiave-di-test");
  assert.equal(esito.consumi.creditiEstrazione, 1);
  assert.equal(esito.consumi.creditiTotali, 5);

  const filiera = esito.fonti.find((fonte) => fonte.url === home);
  assert.ok(filiera);
  assert.equal(filiera.lettoIntegralmente, true);
  assert.equal(filiera.metodoLettura, "tavily_extract");
  assert.match(filiera.estratto ?? "", /Soppressata di Calabria DOP/);
  assert.match(filiera.relazione, /Tavily Extract/);

  const scheda = esito.fonti.find((fonte) => fonte.url === prodotto);
  assert.ok(scheda);
  assert.equal(scheda.lettoIntegralmente, true);
  assert.match(scheda.estratto ?? "", /Salumificio Madeo/);
});

test("RINA generica non diventa una fonte della denominazione", async () => {
  const generica = [
    {
      title: "Certificazione Organismi di Attestazione FGAS - RINA Italy",
      url: "https://www.rina.org/it/fgas-307-2008",
      content: "Certificazione degli organismi di attestazione FGAS.",
      score: 0.8,
    },
  ];
  const risultatiPerQuery = Object.fromEntries(
    costruisciQueryTavily(riconoscimento()).map((query) => [query, generica])
  );
  const { fetchImpl } = fintoFetch({ risultatiPerQuery });
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.ok(!esito.fonti.some((fonte) => fonte.dominio === "www.rina.org"));
});

test("produttore con ragione sociale: il nome distintivo collega le fonti", async () => {
  const { fetchImpl } = fintoFetch();
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({
    riconoscimento: riconoscimento({
      produttore: "Salumificio Madeo S.r.l.",
    }),
  });
  const prova = [
    {
      id: "eambrosia:IT0001",
      tipo: "ufficiale",
      denominazione: "Soppressata di Calabria",
      stato: "registrata",
      schemaQualita: "DOP",
      url: "https://ec.europa.eu/example",
    },
  ];
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({ produttore: "Salumificio Madeo S.r.l." }),
    esito.fonti,
    prova
  );

  assert.equal(sintesi.denominazione.stato, "registrata");
  assert.equal(sintesi.produttore.stato, "dichiarata");
  assert.equal(sintesi.marchio.stato, "menzionata");
});

test("Tavily: una query fallita non elimina le fonti delle altre", async () => {
  const query = costruisciQueryTavily(riconoscimento());
  const { fetchImpl, chiamateTavily } = fintoFetch({
    statusPerQuery: { [query[2]]: 503 },
  });
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.equal(esito.motore, "tavily");
  assert.equal(chiamateTavily.length, 4);
  assert.ok(esito.fonti.length > 0);
  assert.match(esito.messaggio, /1\/4 ricerche non riuscite/i);
  assert.match(esito.messaggio, new RegExp(query[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Tavily: se tutte le query falliscono usa il fallback e lo dichiara", async () => {
  const query = costruisciQueryTavily(riconoscimento());
  const statusPerQuery = Object.fromEntries(query.map((voce) => [voce, 503]));
  const { fetchImpl } = fintoFetch({ statusPerQuery });
  const fallback = {
    nome: "fallback-di-test",
    async cerca() {
      return {
        stato: "ok",
        consultataIl: "2026-11-20",
        query: ["fallback"],
        fonti: [
          {
            id: "web:fallback",
            titolo: "MASAF — Soppressata di Calabria DOP",
            ente: "www.masaf.gov.it",
            url: "https://www.masaf.gov.it/scheda",
            dominio: "www.masaf.gov.it",
            natura: "ufficiale_it",
            attendibilita: "alta",
            consultataIl: "2026-11-20",
            dataDocumento: null,
            estratto: "Denominazione registrata.",
            riferimentoNormativo: null,
            pagineLette: null,
            lettoIntegralmente: true,
            relazione: "Fallback.",
            dichiarazione: "indipendente",
            rilevanza: "alta",
          },
        ],
        messaggio: null,
        durataMs: 1,
        motore: "fallback-di-test",
      };
    },
  };

  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
    fallback,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.motore, "fallback-di-test");
  assert.equal(esito.stato, "ok");
  assert.equal(esito.fonti.length, 1);
  assert.match(esito.messaggio, /4\/4 ricerche non riuscite/i);
  assert.match(esito.messaggio, /fallback/i);
});

test("Tavily senza risultati: esito dichiarato, non prova di assenza", async () => {
  const vuoti = Object.fromEntries(
    costruisciQueryTavily(riconoscimento()).map((query) => [query, []])
  );
  const { fetchImpl, chiamateTavily } = fintoFetch({
    risultatiPerQuery: vuoti,
  });
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(chiamateTavily.length, 4);
  assert.equal(esito.stato, "ok");
  assert.equal(esito.motore, "tavily");
  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non è una prova di assenza/i);
});

test("Tavily: URL duplicati fra query diverse compaiono una sola volta", async () => {
  const { fetchImpl } = fintoFetch({
    risultatiPerQuery: Object.fromEntries(
      costruisciQueryTavily(riconoscimento()).map((query) => [query, RISULTATI])
    ),
  });
  const esito = await creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  }).cerca({ riconoscimento: riconoscimento() });

  const url = esito.fonti.map((fonte) => fonte.url);
  assert.equal(new Set(url).size, url.length);
});

test("Tavily: la cache evita di ripetere le ricerche nella stessa finestra", async () => {
  const { fetchImpl, chiamateTavily } = fintoFetch();
  const provider = creaRicercaWebTavily({
    apiKey: "chiave-di-test",
    fetchImpl,
  });

  await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(chiamateTavily.length, 4);
  await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(chiamateTavily.length, 4, "la seconda analisi deve usare la cache");
});

test("Route e UI: la route usa Tavily e la UI lo dichiara", () => {
  const route = readFileSync(
    radice("app/api/radiscan/analisi/route.ts"),
    "utf8"
  );
  assert.match(route, /creaRicercaWebIbrida/);
  assert.ok(!route.includes("creaRicercaWebGoogle"));

  const ui = readFileSync(radice("components/radiscan/ScanRisultato.tsx"), "utf8");
  assert.match(ui, /Tavily Search/);
});
