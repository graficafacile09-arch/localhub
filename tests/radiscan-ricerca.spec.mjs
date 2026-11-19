/**
 * RADICISCAN — RICERCA DOCUMENTALE UFFICIALE
 *
 * Nessuna rete reale: il `fetch` del registro eAmbrosia è iniettato. I test
 * verificano endpoint, varianti, filtri, prove e distinzione fra risposta
 * vuota ed errore tecnico.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-ricerca.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const radiscan = await import("@/lib/radiscan");
const { creaRicercaEAmbrosia, variantiRicerca } = radiscan;

const RIGA = {
  giIdentifier: "EUGI00000014301",
  protectedNames: ["Pecorino Crotonese"],
  fileNumber: "PDO-IT-1111",
  countries: ["IT"],
  giType: "PDO",
  status: "registered",
  euProtectionDate: "2013-05-13",
  legalInstrument: {
    text: "Official Journal L 341, 27.11.2014",
    uri: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
  },
  publications: [
    {
      text: "Official Journal L 341, 27.11.2014",
      uri: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    },
  ],
  removedFlag: false,
};

function riconoscimento(override = {}) {
  return {
    prodotto: "Pecorino Crotonese",
    categoria: "Formaggi",
    denominazioneProposta: "Pecorino Crotonese DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 82,
    note: null,
    incongruenzeRilevate: [],
    ...override,
  };
}

test("ricerca: usa namelike, rifiuta redirect e produce una prova ufficiale", async () => {
  const richieste = [];
  const fetchImpl = async (url, init) => {
    richieste.push({ url: String(url), init });
    return new Response(JSON.stringify([RIGA]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const provider = creaRicercaEAmbrosia({
    fetchImpl,
    adesso: () => new Date("2026-11-19T10:00:00.000Z"),
  });
  const esito = await provider.cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "ok");
  assert.equal(esito.fonte, "eAmbrosia");
  assert.equal(esito.consultataIl, "2026-11-19");
  assert.equal(esito.prove.length, 1);

  const prova = esito.prove[0];
  assert.equal(prova.id, "eambrosia:EUGI00000014301");
  assert.equal(prova.tipo, "ufficiale");
  assert.equal(prova.denominazione, "Pecorino Crotonese");
  assert.equal(prova.schemaQualita, "DOP");
  assert.equal(prova.stato, "registrata");
  assert.match(prova.url, /^https:\/\/ec\.europa\.eu\//);
  assert.match(prova.documentoUrl, /^https:\/\/eur-lex\.europa\.eu\//);
  assert.match(prova.relazione, /corrispondenza esatta/i);
  assert.match(prova.estratto, /PDO-IT-1111/);

  assert.ok(richieste.length >= 1);
  assert.match(richieste[0].url, /namelike=pecorino\+crotonese/);
  assert.equal(richieste[0].init.redirect, "error");
  assert.equal(richieste[0].init.cache, "no-store");
  assert.equal(richieste[0].init.headers.Accept, "application/json");
});

test("ricerca: produce la variante plurale necessaria per Peperone/Peperoni", () => {
  const query = variantiRicerca(
    riconoscimento({
      prodotto: "Peperone",
      denominazioneProposta: "Peperone di Senise IGP",
      schemaProposto: "IGP",
    })
  );

  assert.ok(query.includes("peperone di senise"));
  assert.ok(query.includes("peperoni di senise"));
  assert.ok(query.length <= 4);
});

test("ricerca: una risposta vuota è un esito ok, non un errore", async () => {
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async () =>
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  assert.deepEqual(esito.prove, []);
  assert.equal(esito.messaggio, null);
});

test("ricerca: errore HTTP, JSON non valido e timeout restano non_disponibile", async () => {
  const casi = [
    async () => new Response("", { status: 503 }),
    async () =>
      new Response("non json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ];

  for (const fetchImpl of casi) {
    const esito = await creaRicercaEAmbrosia({ fetchImpl }).cerca({
      riconoscimento: riconoscimento(),
    });
    assert.equal(esito.stato, "non_disponibile");
    assert.deepEqual(esito.prove, []);
    assert.match(esito.messaggio, /non dimostra l'assenza/i);
  }

  const lento = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const errore = new Error("aborted");
        errore.name = "AbortError";
        reject(errore);
      });
    });

  const esitoTimeout = await creaRicercaEAmbrosia({
    fetchImpl: lento,
    timeoutMs: 10,
  }).cerca({ riconoscimento: riconoscimento() });
  assert.equal(esitoTimeout.stato, "non_disponibile");
});

test("ricerca: scarta denominazioni non pertinenti e URL fuori allowlist", async () => {
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            ...RIGA,
            protectedNames: ["Pecorino Romano"],
            legalInstrument: {
              text: "Fonte non ammessa",
              uri: "https://evil.example/documento",
            },
            publications: [],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  assert.deepEqual(esito.prove, []);
});

test("ricerca: senza un nome utile non chiama la rete", async () => {
  let chiamate = 0;
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async () => {
      chiamate += 1;
      return new Response("[]", { status: 200 });
    },
  });

  const esito = await provider.cerca({
    riconoscimento: riconoscimento({
      prodotto: "",
      denominazioneProposta: null,
    }),
  });

  assert.equal(esito.stato, "non_eseguita");
  assert.equal(chiamate, 0);
});
