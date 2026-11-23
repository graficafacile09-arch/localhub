/**
 * RADICISCAN — TRASPORTO PROGRESSIVO (NDJSON)
 *
 * Verifica che lo streaming non cambi l'analisi: stessi eventi una volta sola,
 * una sola quota, una sola registrazione, una sola scrittura in cache, stesso
 * esito della risposta JSON. Nessuna rete, nessun database, nessun provider
 * reale.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-progressivo.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radiscan = await import("@/lib/radiscan");

const {
  componiEsito,
  creaChiaveCache,
  creaHandlerAnalisi,
  creaRigaCache,
  ErroreRadiciScan,
  improntaContenuto,
  verificaDenominazione,
  VERSIONE_PROMPT,
} = radiscan;

const URL_ROUTE = "https://example.test/api/radiscan/analisi";
const UUID_FONTE = "11111111-1111-4111-8111-111111111111";
const SALE = "sale-di-test-lungo-16";
const SEGRETO_CACHE = "segreto-cache-di-test-0123456789abcdef";
const IP = "203.0.113.7";
const TIPO_NDJSON = "application/x-ndjson";

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const PAYLOAD_AI = JSON.stringify({
  prodotto: "Pecorino Crotonese",
  categoria: "Formaggi",
  denominazione_proposta: "Pecorino Crotonese DOP",
  territorio_proposto: "Provincia di Crotone",
  schema_proposto: "DOP",
  indicatori_etichetta: ["DOP"],
  confidenza: 80,
  note: null,
  incongruenze_rilevate: [],
});

function fonte(override = {}) {
  return {
    id: UUID_FONTE,
    slug: "demo-pecorino",
    denominazione: "Pecorino Crotonese DOP",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Provincia di Crotone",
    ente: "MASAF",
    urlUfficiale:
      "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
    riferimentoNormativo: "Reg. (UE) 2024/1143",
    consultataIl: "2026-11-18",
    attiva: true,
    ...override,
  };
}

function provaEAmbrosia() {
  return {
    id: "eambrosia:EUGI00000014301",
    tipo: "ufficiale",
    denominazione: "Pecorino Crotonese",
    schemaQualita: "DOP",
    ente: "Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)",
    titolo: "eAmbrosia — Pecorino Crotonese (PDO)",
    url: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000014301",
    riferimentoNormativo: "Official Journal L 341, 27.11.2014",
    riferimentoUrl:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    documentoUrl:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    estratto: "Scheda EUGI00000014301 · stato: registrata",
    consultataIl: "2026-11-18",
    relazione: "Corrispondenza esatta con la denominazione letta.",
    stato: "registrata",
  };
}

function creaRepositoryFinto(over = {}) {
  const chiamate = { registro: 0, cache: 0, cacheScritte: 0, analisi: 0, quote: 0 };
  return {
    chiamate,
    async leggiRegistro() {
      chiamate.registro += 1;
      return [fonte()];
    },
    async leggiCache() {
      chiamate.cache += 1;
      return null;
    },
    async scriviCache() {
      chiamate.cacheScritte += 1;
    },
    async registraAnalisi() {
      chiamate.analisi += 1;
    },
    async consumaQuota() {
      chiamate.quote += 1;
      return { consentita: true, usatiOggi: 1, limiteGiorno: 100, limiteMinuto: 10 };
    },
    ...over,
  };
}

function creaProviderFinto({ testo = PAYLOAD_AI } = {}) {
  const stato = { chiamate: 0, signal: null };
  return {
    stato,
    provider: {
      nome: "finto",
      modello: "finto-1",
      async genera(richiesta) {
        stato.chiamate += 1;
        stato.signal = richiesta?.signal ?? null;
        return { testo };
      },
    },
  };
}

function creaRicercaFinta() {
  return {
    async cerca() {
      return {
        stato: "ok",
        fonte: "eAmbrosia",
        consultataIl: "2026-11-18",
        query: ["pecorino crotonese"],
        prove: [provaEAmbrosia()],
        messaggio: null,
      };
    },
  };
}

function creaWebFinto() {
  return {
    async cerca() {
      return {
        stato: "ok",
        consultataIl: "2026-11-18",
        query: ["pecorino crotonese DOP"],
        fonti: [
          {
            id: "web:1",
            titolo: "Pecorino Crotonese DOP",
            dominio: "masaf.gov.it",
            url: "https://www.masaf.gov.it/pecorino-crotonese",
            tipo: "ufficiale",
            estratto: "Scheda della denominazione.",
            consultataIl: "2026-11-18",
          },
        ],
        messaggio: null,
        durataMs: 12,
        motore: "finto-web",
        sintesi: null,
      };
    },
  };
}

function creaAmbiente({
  repository = creaRepositoryFinto(),
  provider = creaProviderFinto(),
  creaRicerca = () => creaRicercaFinta(),
  creaWeb = () => creaWebFinto(),
} = {}) {
  const handler = creaHandlerAnalisi({
    utenteCorrente: async () => null,
    creaRepository: () => repository,
    creaProvider: () => provider.provider,
    creaRicerca,
    creaWeb,
    saleQuota: SALE,
    segretoCache: SEGRETO_CACHE,
    adesso: () => new Date("2026-11-18T10:00:00.000Z"),
  });
  return { handler, repository, provider };
}

/** Esecuzione in condizioni Vercel: header IP attendibili. */
async function esegui(handler, request) {
  const precedenti = {
    VERCEL: process.env.VERCEL,
    RADISCAN_TRUSTED_PROXY: process.env.RADISCAN_TRUSTED_PROXY,
  };
  process.env.VERCEL = "1";
  delete process.env.RADISCAN_TRUSTED_PROXY;
  try {
    return await handler(request);
  } finally {
    for (const [chiave, valore] of Object.entries(precedenti)) {
      if (valore === undefined) delete process.env[chiave];
      else process.env[chiave] = valore;
    }
  }
}

function richiestaProgressiva({ signal, accept = TIPO_NDJSON } = {}) {
  const form = new FormData();
  form.append("immagine", new File([JPEG], "foto.jpg", { type: "image/jpeg" }));
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { accept, "x-forwarded-for": IP },
    body: form,
    ...(signal ? { signal } : {}),
  });
}

function richiestaClassica() {
  const form = new FormData();
  form.append("immagine", new File([JPEG], "foto.jpg", { type: "image/jpeg" }));
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { accept: "application/json", "x-forwarded-for": IP },
    body: form,
  });
}

/** Righe NDJSON: ogni riga deve essere JSON autonomo e terminare con \n. */
async function leggiEventi(risposta) {
  const testo = await risposta.text();
  assert.ok(testo.endsWith("\n"), "l'ultimo evento deve terminare con un a capo");
  return testo
    .split("\n")
    .filter((riga) => riga.trim().length > 0)
    .map((riga) => JSON.parse(riga));
}

function esitoVerificatoDiProva() {
  const riconoscimento = {
    prodotto: "Pecorino Crotonese",
    categoria: "Formaggi",
    denominazioneProposta: "Pecorino Crotonese DOP",
    territorioProposto: "Provincia di Crotone",
    schemaProposto: "DOP",
    indicatoriEtichetta: [],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
  };
  return componiEsito({
    riconoscimento,
    verifica: verificaDenominazione(riconoscimento, [fonte()]),
    versionePrompt: VERSIONE_PROMPT,
  });
}

function esitoNonVerificatoDiProva() {
  const riconoscimento = {
    prodotto: "Prodotto generico",
    categoria: null,
    denominazioneProposta: "Prodotto di Atlantide DOP",
    territorioProposto: null,
    schemaProposto: null,
    indicatoriEtichetta: [],
    confidenza: 40,
    note: null,
    incongruenzeRilevate: [],
  };
  return componiEsito({
    riconoscimento,
    verifica: verificaDenominazione(riconoscimento, []),
    versionePrompt: VERSIONE_PROMPT,
  });
}

function rigaCacheDi(esito) {
  const chiave = creaChiaveCache(
    improntaContenuto(JPEG, SEGRETO_CACHE),
    VERSIONE_PROMPT
  );
  return creaRigaCache(chiave, esito, new Date("2026-11-18T09:00:00.000Z"));
}

// ─── Equivalenza JSON / NDJSON ─────────────────────────────────────────────

test("progressivo: stesso esito della risposta JSON, in un solo evento finale", async () => {
  const classico = creaAmbiente();
  const rispostaJson = await esegui(classico.handler, richiestaClassica());
  assert.equal(rispostaJson.status, 200);
  const corpo = await rispostaJson.json();

  const progressivo = creaAmbiente();
  const risposta = await esegui(progressivo.handler, richiestaProgressiva());

  assert.equal(risposta.status, 200);
  assert.match(risposta.headers.get("content-type") ?? "", /application\/x-ndjson/);
  assert.equal(risposta.headers.get("cache-control"), "no-store");
  assert.equal(risposta.headers.get("x-accel-buffering"), "no");

  const eventi = await leggiEventi(risposta);
  const esito = eventi.find((evento) => evento.evento === "esito");

  assert.ok(esito, "deve arrivare l'evento esito");
  assert.equal(eventi.at(-1).evento, "esito", "l'esito è l'ultimo evento");

  // I tempi misurati cambiano tra due esecuzioni: si confronta tutto il resto.
  const senzaTempi = ({ tempi, ...resto }) => resto;
  assert.deepEqual(senzaTempi(esito.esito), senzaTempi(corpo.esito));
  assert.equal(esito.cache, corpo.cache);
  assert.equal(esito.preliminare, false);
  assert.equal(corpo.success, true);
  assert.equal(classico.repository.chiamate.analisi, progressivo.repository.chiamate.analisi);
});

test("progressivo: ordine riconoscimento → documentale → web → esito", async () => {
  const { handler } = creaAmbiente();
  const risposta = await esegui(handler, richiestaProgressiva());
  const eventi = await leggiEventi(risposta);

  assert.deepEqual(
    eventi.map((evento) => evento.evento),
    ["riconoscimento", "documentale", "web", "esito"]
  );

  // Il riconoscimento è dichiarato preliminare e conserva l'ipotesi del modello.
  assert.equal(eventi[0].preliminare, true);
  assert.equal(eventi[0].riconoscimento.prodotto, "Pecorino Crotonese");
  assert.equal(eventi[1].preliminare, true);
  assert.equal(eventi[1].ricerca.stato, "ok");
  assert.equal(eventi[2].preliminare, true);
  // La sintesi dipende dalle prove documentali: nello stream non è mai inventata.
  assert.equal(eventi[2].web.sintesi, null);
});

test("progressivo: una sola quota, una sola analisi, una registrazione e una cache", async () => {
  const { handler, repository, provider } = creaAmbiente();
  const risposta = await esegui(handler, richiestaProgressiva());
  const eventi = await leggiEventi(risposta);

  assert.equal(eventi.at(-1).evento, "esito");
  assert.equal(repository.chiamate.quote, 1);
  assert.equal(repository.chiamate.cache, 1);
  assert.equal(repository.chiamate.registro, 1);
  assert.equal(repository.chiamate.analisi, 1);
  assert.equal(repository.chiamate.cacheScritte, 1);
  assert.equal(provider.stato.chiamate, 1);
});

// ─── Cache ─────────────────────────────────────────────────────────────────

test("progressivo: cache hit non emette preliminari e non chiama il provider", async () => {
  const repository = creaRepositoryFinto({
    async leggiCache() {
      this.chiamate.cache += 1;
      return rigaCacheDi(esitoNonVerificatoDiProva());
    },
  });
  const { handler, provider } = creaAmbiente({ repository });

  const risposta = await esegui(handler, richiestaProgressiva());
  const eventi = await leggiEventi(risposta);

  assert.deepEqual(
    eventi.map((evento) => evento.evento),
    ["esito"]
  );
  assert.equal(eventi[0].cache, true);
  assert.equal(provider.stato.chiamate, 0);
  // Come nella variante JSON: la quota è consumata e l'analisi è registrata.
  assert.equal(repository.chiamate.quote, 1);
  assert.equal(repository.chiamate.analisi, 1);
  assert.equal(repository.chiamate.cacheScritte, 0);
  assert.equal(repository.chiamate.registro, 0);
});

// ─── Errori ────────────────────────────────────────────────────────────────

test("progressivo: errore dopo l'avvio arriva come evento, senza esito", async () => {
  const repository = creaRepositoryFinto({
    async registraAnalisi() {
      this.chiamate.analisi += 1;
      throw new Error("database giù");
    },
  });
  const { handler } = creaAmbiente({ repository });

  const risposta = await esegui(handler, richiestaProgressiva());
  assert.equal(risposta.status, 200, "lo status resta 200: l'errore viaggia nello stream");

  const eventi = await leggiEventi(risposta);
  assert.equal(eventi.at(-1).evento, "errore");
  assert.equal(eventi.at(-1).errore.codice, "REGISTRAZIONE_NON_DISPONIBILE");
  assert.equal(eventi.at(-1).stato, 503);
  assert.ok(!eventi.some((evento) => evento.evento === "esito"));
  assert.equal(repository.chiamate.cacheScritte, 0);
});

test("progressivo: errore prima dell'analisi resta JSON con lo status originale", async () => {
  const repository = creaRepositoryFinto({
    async consumaQuota() {
      this.chiamate.quote += 1;
      throw new ErroreRadiciScan("QUOTA_NON_DISPONIBILE", "quota giù");
    },
  });
  const { handler, provider } = creaAmbiente({ repository });

  const risposta = await esegui(handler, richiestaProgressiva());
  assert.equal(risposta.status, 503);
  assert.match(risposta.headers.get("content-type") ?? "", /application\/json/);

  const corpo = await risposta.json();
  assert.equal(corpo.success, false);
  assert.equal(corpo.errore.codice, "QUOTA_NON_DISPONIBILE");
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.analisi, 0);
});

// ─── Annullamento ──────────────────────────────────────────────────────────

async function attendi(condizione, etichetta) {
  for (let tentativo = 0; tentativo < 100; tentativo += 1) {
    if (condizione()) return;
    await new Promise((risolvi) => setTimeout(risolvi, 10));
  }
  assert.fail(`tempo scaduto: ${etichetta}`);
}

function providerCheAttendeAbort(stato) {
  return {
    provider: {
      nome: "finto",
      modello: "finto-1",
      async genera({ signal } = {}) {
        stato.chiamate += 1;
        await new Promise((risolvi) => {
          if (!signal || signal.aborted) return risolvi();
          signal.addEventListener("abort", () => risolvi(), { once: true });
        });
        stato.abortito = true;
        throw new Error("richiesta annullata");
      },
    },
  };
}

test("progressivo: chiudere lo stream ferma davvero il lavoro sul server", async () => {
  const stato = { abortito: false, chiamate: 0 };
  const repository = creaRepositoryFinto();
  const { handler } = creaAmbiente({
    repository,
    provider: providerCheAttendeAbort(stato),
  });

  const risposta = await esegui(handler, richiestaProgressiva());
  assert.equal(risposta.status, 200);

  // Il client smette di leggere: il server deve annullare le operazioni.
  await risposta.body.cancel();
  await attendi(() => stato.abortito, "il provider non ha ricevuto l'abort");

  assert.equal(stato.chiamate, 1);
  assert.equal(repository.chiamate.analisi, 0);
  assert.equal(repository.chiamate.cacheScritte, 0);
});

test("progressivo: l'annullamento del client aborta il segnale e ferma il lavoro", async () => {
  const stato = { abortito: false, chiamate: 0 };
  const provider = providerCheAttendeAbort(stato);
  const repository = creaRepositoryFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const annulla = new AbortController();
  const risposta = await esegui(
    handler,
    richiestaProgressiva({ signal: annulla.signal })
  );
  annulla.abort();

  await risposta.text().catch(() => "");

  assert.equal(stato.chiamate, 1);
  assert.equal(stato.abortito, true, "il provider deve ricevere l'abort");
  assert.equal(repository.chiamate.analisi, 0, "un'annullamento non registra nulla");
  assert.equal(repository.chiamate.cacheScritte, 0);
});

// ─── Presentazione in primo piano (sorgenti UI) ──────────────────────────────

const leggi = (percorso) =>
  readFileSync(fileURLToPath(new URL(`../${percorso}`, import.meta.url)), "utf8");

test("UI: nessuna etichetta interna «preliminare» o formula tecnica visibile", () => {
  const risultato = leggi("components/radiscan/ScanRisultato.tsx");
  const progressivo = risultato.slice(
    risultato.indexOf("export function ScanRisultatoProgressivo")
  );

  assert.doesNotMatch(progressivo, />\s*preliminare\s*</);
  assert.doesNotMatch(progressivo, /Dati parziali|non ancora verificati|Analisi in corso/);
});

test("UI: il progressivo usa la stessa area principale dell'esito e scorre al primo dato", () => {
  const studio = leggi("components/radiscan/RadiciScanStudio.tsx");

  // Il ref è lo stesso per esito e progressivo: un solo contenitore principale.
  assert.equal(studio.match(/ref=\{risultatoRef\}/g)?.length, 2);
  assert.match(studio, /primoDatoArrivato/);
  assert.match(
    studio,
    /if \(!primoDatoArrivato\) return;[\s\S]*?scrollIntoView/
  );
});
