/**
 * RADICISCAN — TEST DELLA ROUTE E DELL'ADAPTER (FASE 2C)
 *
 * L'handler è testato con dipendenze iniettate: nessuna chiamata AI reale,
 * nessuna rete, nessun database. Il cablaggio della route è verificato in
 * modo statico.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-route.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const radiscan = await import("@/lib/radiscan");

const {
  componiEsito,
  creaChiaveCache,
  creaChiaveQuotaAnonima,
  creaHandlerAnalisi,
  creaRigaCache,
  creaRepositorySupabase,
  ErroreRadiciScan,
  improntaContenuto,
  MAX_IMAGE_BYTES,
  MAX_REQUEST_BYTES,
  normalizzaIp,
  verificaDenominazione,
  VERSIONE_PROMPT,
} = radiscan;

const radice = (percorso) => fileURLToPath(new URL(`../${percorso}`, import.meta.url));
const URL_ROUTE = "https://example.test/api/radiscan/analisi";
const UUID_UTENTE = "33333333-3333-4333-8333-333333333333";
const UUID_FONTE = "11111111-1111-4111-8111-111111111111";
const SALE = "sale-di-test-lungo-16";
const SEGRETO_CACHE = "segreto-cache-di-test-0123456789abcdef";
const SEGRETO_CACHE_2 = "segreto-cache-diverso-0123456789abcdef";
const IP = "203.0.113.7";

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
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
    urlUfficiale: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
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
  const chiamate = { registro: 0, cache: [], cacheScritte: [], analisi: [], quote: [] };
  return {
    chiamate,
    async leggiRegistro() {
      chiamate.registro += 1;
      return [fonte()];
    },
    async leggiCache(chiave) {
      chiamate.cache.push(chiave);
      return null;
    },
    async scriviCache(riga) {
      chiamate.cacheScritte.push(riga);
    },
    async registraAnalisi(riga) {
      chiamate.analisi.push(riga);
    },
    async consumaQuota(chiave, modalita) {
      chiamate.quote.push({ chiave, modalita });
      return modalita === "anonimo"
        ? { consentita: true, usatiOggi: 1, limiteGiorno: 100, limiteMinuto: 10 }
        : { consentita: true, usatiOggi: 1, limiteGiorno: 300, limiteMinuto: 30 };
    },
    ...over,
  };
}

function creaProviderFinto({ testo = PAYLOAD_AI, errore = null } = {}) {
  const stato = { chiamate: 0 };
  return {
    stato,
    provider: {
      nome: "finto",
      modello: "finto-1",
      async genera() {
        stato.chiamate += 1;
        if (errore) throw errore;
        return { testo };
      },
    },
  };
}

function creaAmbiente({
  utente = null,
  utenteCorrente,
  repository = creaRepositoryFinto(),
  provider = creaProviderFinto(),
  sale = SALE,
  segretoCache = SEGRETO_CACHE,
  creaRepository,
  creaRicerca,
} = {}) {
  const handler = creaHandlerAnalisi({
    utenteCorrente: utenteCorrente ?? (async () => utente),
    creaRepository: creaRepository ?? (() => repository),
    creaProvider: () => provider.provider,
    creaRicerca,
    saleQuota: sale,
    segretoCache,
    adesso: () => new Date("2026-11-18T10:00:00.000Z"),
  });
  return { handler, repository, provider };
}

async function conAmbiente(variabili, azione) {
  const precedenti = {};
  for (const [chiave, valore] of Object.entries(variabili)) {
    precedenti[chiave] = process.env[chiave];
    if (valore === undefined) delete process.env[chiave];
    else process.env[chiave] = valore;
  }
  try {
    return await azione();
  } finally {
    for (const [chiave, valore] of Object.entries(precedenti)) {
      if (valore === undefined) delete process.env[chiave];
      else process.env[chiave] = valore;
    }
  }
}

/** Esecuzione in condizioni Vercel: header IP attendibili e niente proxy locale. */
const handlerVercel = (handler, request) =>
  conAmbiente({ VERCEL: "1", RADISCAN_TRUSTED_PROXY: undefined }, () => handler(request));

function richiestaMultipart({
  bytes = JPEG,
  tipo = "image/jpeg",
  headers = { "x-forwarded-for": IP },
} = {}) {
  const form = new FormData();
  form.append("immagine", new File([bytes], "foto.jpg", { type: tipo }));
  return new Request(URL_ROUTE, { method: "POST", headers, body: form });
}

function richiestaJson({
  base64 = JPEG.toString("base64"),
  mimeType = "image/jpeg",
  headers = { "x-forwarded-for": IP },
} = {}) {
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ immagineBase64: base64, mimeType }),
  });
}

function richiestaMultipartGrezza(boundary, headers = { "x-forwarded-for": IP }) {
  // Boundary intenzionalmente misto, come quelli generati da WebKit.
  const corpo = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="immagine"; filename="foto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ),
    JPEG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Request(URL_ROUTE, {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      ...headers,
    },
    body: corpo,
  });
}

function richiestaStream({ pezzi, headers }) {
  let indice = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (indice >= pezzi.length) {
        controller.close();
        return;
      }
      controller.enqueue(pezzi[indice]);
      indice += 1;
    },
  });
  return new Request(URL_ROUTE, { method: "POST", headers, body, duplex: "half" });
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

function rigaCacheDi(esito, adesso = new Date("2026-11-18T09:00:00.000Z")) {
  const chiave = creaChiaveCache(improntaContenuto(JPEG, SEGRETO_CACHE), VERSIONE_PROMPT);
  return creaRigaCache(chiave, esito, adesso);
}

// ─── Richieste valide ──────────────────────────────────────────────────────

test("route: richiesta anonima valida applica quota, analizza e registra", async () => {
  const { handler, repository } = creaAmbiente();
  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.success, true);
  assert.equal(corpo.cache, false);
  assert.equal(corpo.esito.livello, "verificato");
  assert.equal(corpo.esito.fonteId, UUID_FONTE);
  assert.equal(corpo.esito.denominazioneVerificata, "Pecorino Crotonese DOP");

  assert.equal(repository.chiamate.quote.length, 1);
  assert.equal(repository.chiamate.quote[0].modalita, "anonimo");
  assert.equal(
    repository.chiamate.quote[0].chiave,
    creaChiaveQuotaAnonima(IP, SALE)
  );

  assert.equal(repository.chiamate.analisi.length, 1);
  const riga = repository.chiamate.analisi[0];
  assert.equal(riga.modalita, "anonimo");
  assert.equal(riga.utenteId, null);
  assert.equal(riga.fonteId, UUID_FONTE);
  assert.equal(riga.esito.fonteId, riga.fonteId, "fonte_id coerente con esito.fonteId");
  assert.equal(riga.denominazioneVerificata, "Pecorino Crotonese DOP");
  assert.equal(riga.improntaImmagine, improntaContenuto(JPEG, SEGRETO_CACHE));
  assert.equal(riga.improntaImmagine.length, 16);

  assert.equal(repository.chiamate.cacheScritte.length, 1);
  assert.equal(repository.chiamate.cacheScritte[0].fonteId, UUID_FONTE);

  const testo = JSON.stringify(corpo);
  assert.ok(!testo.includes(IP), "nessun IP nella risposta");
  assert.ok(!testo.includes(SALE), "nessun sale nella risposta");
  assert.ok(!testo.includes(SEGRETO_CACHE), "nessun segreto cache nella risposta");
  assert.ok(!testo.includes(JPEG.toString("base64")), "nessuna immagine nella risposta");
});

test("route: richiesta autenticata usa la sessione verificata", async () => {
  const { handler, repository } = creaAmbiente({ utente: { id: UUID_UTENTE } });
  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).success, true);

  assert.equal(repository.chiamate.quote[0].modalita, "autenticato");
  assert.equal(repository.chiamate.quote[0].chiave, `utente:${UUID_UTENTE}`);
  assert.equal(repository.chiamate.analisi[0].utenteId, UUID_UTENTE);
});

test("route: accetta anche JSON base64 valido", async () => {
  const { handler } = creaAmbiente();
  const risposta = await handlerVercel(handler, richiestaJson());

  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).esito.livello, "verificato");
});

test("route: il boundary multipart misto (WebKit) non viene alterato", async () => {
  const { handler } = creaAmbiente();

  for (const boundary of [
    "----WebKitFormBoundaryABC123",
    "----MixedCase-Boundary_42",
    "----webkitformboundaryabc123",
  ]) {
    const risposta = await handlerVercel(handler, richiestaMultipartGrezza(boundary));
    assert.equal(risposta.status, 200, `boundary: ${boundary}`);
    assert.equal((await risposta.json()).esito.livello, "verificato");
  }
});

// ─── Quote ─────────────────────────────────────────────────────────────────

test("route: quota superata risponde 429 senza chiamare l'AI", async () => {
  const quote = [];
  const repository = creaRepositoryFinto({
    async consumaQuota(chiave, modalita) {
      quote.push({ chiave, modalita });
      return {
        consentita: false,
        motivo: "Hai raggiunto il limite di 10 analisi al minuto. Riprova tra poco.",
        riprovaTraSecondi: 42,
        usatiOggi: 10,
        limiteGiorno: 100,
        limiteMinuto: 10,
      };
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 429);
  assert.equal(risposta.headers.get("retry-after"), "42");
  const corpo = await risposta.json();
  assert.equal(corpo.errore.codice, "QUOTA_SUPERATA");
  assert.equal(
    corpo.errore.messaggio,
    "Hai raggiunto il limite di 10 analisi al minuto. Riprova tra poco."
  );
  assert.deepEqual(corpo.quota, {
    usatiOggi: 10,
    limiteGiorno: 100,
    limiteMinuto: 10,
  });
  assert.equal(risposta.headers.get("x-radiciscan-limite-giorno"), "100");
  assert.equal(risposta.headers.get("x-radiciscan-limite-minuto"), "10");
  assert.equal(quote.length, 1);
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.analisi.length, 0);
});

test("route: quota autenticata superata risponde 429 senza chiamare l'AI", async () => {
  const repository = creaRepositoryFinto({
    async consumaQuota() {
      return {
        consentita: false,
        motivo: "Hai raggiunto il limite di 30 analisi al minuto. Riprova tra poco.",
        riprovaTraSecondi: 30,
        usatiOggi: 30,
        limiteGiorno: 300,
        limiteMinuto: 30,
      };
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({
    repository,
    provider,
    utente: { id: UUID_UTENTE },
  });

  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 429);
  assert.equal(risposta.headers.get("retry-after"), "30");
  const corpo = await risposta.json();
  assert.equal(corpo.errore.codice, "QUOTA_SUPERATA");
  assert.equal(
    corpo.errore.messaggio,
    "Hai raggiunto il limite di 30 analisi al minuto. Riprova tra poco."
  );
  assert.deepEqual(corpo.quota, {
    usatiOggi: 30,
    limiteGiorno: 300,
    limiteMinuto: 30,
  });
  assert.equal(risposta.headers.get("x-radiciscan-limite-giorno"), "300");
  assert.equal(risposta.headers.get("x-radiciscan-limite-minuto"), "30");
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.analisi.length, 0);
});

test("route: RPC quote non disponibile => 503, nessuna analisi", async () => {
  const repository = creaRepositoryFinto({
    async consumaQuota() {
      throw new ErroreRadiciScan("RADICSCAN_QUOTA_NON_DISPONIBILE", "db");
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).errore.codice, "QUOTA_NON_DISPONIBILE");
  assert.equal(provider.stato.chiamate, 0);
});

test("route: fuori da Vercel senza proxy fidato => 503 e nessuna quota", async () => {
  const { handler, repository } = creaAmbiente();
  const richiesta = richiestaMultipart({
    headers: { "x-real-ip": IP, "x-forwarded-for": IP },
  });

  const risposta = await conAmbiente(
    { VERCEL: undefined, RADISCAN_TRUSTED_PROXY: undefined },
    () => handler(richiesta)
  );

  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).errore.codice, "IDENTIFICAZIONE_NON_DISPONIBILE");
  assert.equal(repository.chiamate.quote.length, 0);
});

test("route: sale mancante => 503 per gli anonimi", async () => {
  const { handler } = creaAmbiente({ sale: null });
  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).errore.codice, "IDENTIFICAZIONE_NON_DISPONIBILE");
});

// ─── Sessione e database ───────────────────────────────────────────────────

test("route: sessione non valida => 401", async () => {
  const { handler } = creaAmbiente({
    utenteCorrente: async () => {
      throw new ErroreRadiciScan("RADICSCAN_SESSIONE_NON_VALIDA", "token");
    },
  });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 401);
  assert.equal((await risposta.json()).errore.codice, "SESSIONE_NON_VALIDA");
});

test("route: database non disponibile => 503 senza dettagli", async () => {
  const { handler } = creaAmbiente({
    creaRepository: () => {
      throw new Error("connessione rifiutata dal database");
    },
  });
  const risposta = await handlerVercel(handler, richiestaMultipart());

  assert.equal(risposta.status, 503);
  const testo = await risposta.text();
  assert.ok(!testo.includes("connessione"));
  assert.ok(!testo.includes("database"));

  const registroRotto = creaRepositoryFinto({
    async leggiRegistro() {
      throw new Error("radiscan_fonti non raggiungibile");
    },
  });
  const provider = creaProviderFinto();
  const secondo = creaAmbiente({ repository: registroRotto, provider });

  const risposta2 = await handlerVercel(secondo.handler, richiestaMultipart());
  assert.equal(risposta2.status, 503);
  const testo2 = await risposta2.text();
  assert.ok(!testo2.includes("radiscan_fonti"));
  assert.equal(provider.stato.chiamate, 0);
});

// ─── Immagini e limite del body ────────────────────────────────────────────

test("route: immagine oltre 3 MB => 413", async () => {
  const { handler } = creaAmbiente();
  const grande = Buffer.alloc(MAX_IMAGE_BYTES + 1);
  JPEG.copy(grande, 0);

  const risposta = await handlerVercel(handler, richiestaMultipart({ bytes: grande }));
  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).errore.codice, "IMMAGINE_TROPPO_GRANDE");
});

test("route: JSON/base64 oltre 3 MB => 413, senza chiamare l'AI", async () => {
  const { handler, provider } = creaAmbiente();
  const grande = Buffer.alloc(MAX_IMAGE_BYTES + 1);
  JPEG.copy(grande, 0);

  // Base64 di 3 MB + 1: sotto il tetto del body, sopra il limite immagine.
  const risposta = await handlerVercel(
    handler,
    richiestaJson({ base64: grande.toString("base64") })
  );

  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).errore.codice, "IMMAGINE_TROPPO_GRANDE");
  assert.equal(provider.stato.chiamate, 0);
});

test("route: richiesta oltre il tetto viene rifiutata prima del parsing", async () => {
  const { handler, provider } = creaAmbiente();
  const pezzi = Array.from({ length: 20 }, () => Buffer.alloc(256 * 1024, 0x41));
  // Corpo volutamente non multipart valido: se venisse parsato sarebbe 400.
  const richiesta = richiestaStream({
    pezzi,
    headers: {
      "content-type": "multipart/form-data; boundary=xyz",
      "x-forwarded-for": IP,
    },
  });

  const risposta = await handlerVercel(handler, richiesta);

  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).errore.codice, "IMMAGINE_TROPPO_GRANDE");
  assert.equal(provider.stato.chiamate, 0);
  assert.ok(20 * 256 * 1024 > MAX_REQUEST_BYTES);
});

test("route: Content-Length oltre il tetto è un precontrollo 413", async () => {
  const { handler } = creaAmbiente();
  const finta = {
    headers: new Headers({
      "content-type": "multipart/form-data; boundary=xyz",
      "content-length": String(MAX_REQUEST_BYTES + 1),
      "x-forwarded-for": IP,
    }),
    body: null,
  };

  const risposta = await handlerVercel(handler, finta);
  assert.equal(risposta.status, 413);
  assert.equal((await risposta.json()).errore.codice, "IMMAGINE_TROPPO_GRANDE");
});

test("route: body troncato rispetto a Content-Length => 400", async () => {
  const { handler } = creaAmbiente();
  const richiesta = richiestaStream({
    pezzi: [Buffer.from("0123456789")],
    headers: {
      "content-type": "multipart/form-data; boundary=xyz",
      "content-length": "20",
      "x-forwarded-for": IP,
    },
  });

  const risposta = await handlerVercel(handler, richiesta);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).errore.codice, "RICHIESTA_NON_VALIDA");
});

test("route: MIME non supportato e contenuto incoerente => 415/400", async () => {
  const { handler } = creaAmbiente();

  const gif = await handlerVercel(handler, richiestaMultipart({ tipo: "image/gif" }));
  assert.equal(gif.status, 415);

  const incoerente = await handlerVercel(
    handler,
    richiestaMultipart({ bytes: PNG, tipo: "image/jpeg" })
  );
  assert.equal(incoerente.status, 400);

  const finto = await handlerVercel(
    handler,
    richiestaMultipart({ bytes: Buffer.from("non è un'immagine"), tipo: "image/jpeg" })
  );
  assert.equal(finto.status, 400);
});

test("route: base64 malformato => 400, nessuna chiamata AI", async () => {
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ provider });

  for (const base64 of ["###", "AAAAA", "data:image/jpeg;base64,AAAA", ""]) {
    const risposta = await handlerVercel(handler, richiestaJson({ base64 }));
    assert.equal(risposta.status, 400, `base64: ${base64}`);
  }

  assert.equal(provider.stato.chiamate, 0);
});

// ─── Errori del provider e schema ──────────────────────────────────────────

test("route: timeout e errore del provider => 504/502", async () => {
  const timeout = creaProviderFinto({
    errore: new ErroreRadiciScan("RADICSCAN_PROVIDER_TIMEOUT", "lento"),
  });
  const prima = creaAmbiente({ provider: timeout });
  const risposta = await handlerVercel(prima.handler, richiestaMultipart());
  assert.equal(risposta.status, 504);
  assert.equal((await risposta.json()).errore.codice, "ANALISI_SCADUTA");

  const rete = creaProviderFinto({
    errore: new ErroreRadiciScan("RADICSCAN_PROVIDER_RETE", "dns"),
  });
  const seconda = creaAmbiente({ provider: rete });
  const risposta2 = await handlerVercel(seconda.handler, richiestaMultipart());
  assert.equal(risposta2.status, 502);
  const testo = await risposta2.text();
  assert.ok(!testo.includes("dns"));
});

test("route: risposta AI non valida => 502 e nessuna registrazione", async () => {
  const provider = creaProviderFinto({ testo: "non sono json" });
  const { handler, repository } = creaAmbiente({ provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 502);
  assert.equal((await risposta.json()).errore.codice, "RISPOSTA_AI_NON_VALIDA");
  assert.equal(repository.chiamate.analisi.length, 0);
});

// ─── Fonti e cache ─────────────────────────────────────────────────────────

test("route: senza fonte documentale non esiste alcun verificato", async () => {
  const repository = creaRepositoryFinto({
    async leggiRegistro() {
      return [fonte({ tipoAtto: "registro", schemaQualita: null, territorio: null })];
    },
  });
  const { handler } = creaAmbiente({ repository });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.notEqual(corpo.esito.livello, "verificato");
  assert.equal(corpo.esito.fonteId, null);
  assert.equal(corpo.esito.denominazioneVerificata, null);

  const riga = repository.chiamate.analisi[0];
  assert.equal(riga.fonteId, null);
  assert.equal(riga.denominazioneVerificata, null);
  assert.equal(repository.chiamate.cacheScritte[0].fonteId, null);
});

test("route: prova eAmbrosia esatta senza fonte curata => riscontro parziale", async () => {
  const repository = creaRepositoryFinto({
    async leggiRegistro() {
      return [];
    },
  });
  const ricerca = {
    nome: "eAmbrosia-finto",
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
  const { handler } = creaAmbiente({
    repository,
    creaRicerca: () => ricerca,
  });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.esito.livello, "coerente_non_verificato");
  assert.equal(corpo.esito.verifica.esito, "riscontro_parziale");
  assert.equal(corpo.esito.verifica.prove.length, 1);
  assert.equal(corpo.esito.verifica.prove[0].id, "eambrosia:EUGI00000014301");
  assert.equal(corpo.esito.fonteId, null);
  assert.equal(corpo.esito.denominazioneVerificata, null);
  assert.equal(repository.chiamate.analisi[0].livello, "coerente_non_verificato");
  assert.equal(repository.chiamate.cacheScritte.length, 1);
});

test("route: errore eAmbrosia => esito esplicito e nessuna cache", async () => {
  const repository = creaRepositoryFinto({
    async leggiRegistro() {
      return [];
    },
  });
  const ricerca = {
    nome: "eAmbrosia-finto",
    async cerca() {
      return {
        stato: "non_disponibile",
        fonte: "eAmbrosia",
        consultataIl: "2026-11-18",
        query: ["pecorino crotonese"],
        prove: [],
        messaggio:
          "La ricerca nel registro eAmbrosia non è stata completata. L'esito non dimostra l'assenza di fonti.",
      };
    },
  };
  const { handler } = creaAmbiente({
    repository,
    creaRicerca: () => ricerca,
  });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.esito.livello, "non_verificato");
  assert.equal(corpo.esito.verifica.esito, "ricerca_non_disponibile");
  assert.match(corpo.esito.verifica.motivazione, /non dimostra l'assenza/i);
  assert.equal(repository.chiamate.cacheScritte.length, 0);
});

test("cache: un verificato valido evita l'AI e conserva fonte_id", async () => {
  const rigaCache = rigaCacheDi(esitoVerificatoDiProva());
  const repository = creaRepositoryFinto({
    async leggiCache() {
      return rigaCache;
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.cache, true);
  assert.equal(corpo.esito.livello, "verificato");
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.registro, 1, "fonte rivalidata prima del riuso");
  assert.equal(repository.chiamate.analisi[0].provider, "cache");
  assert.equal(repository.chiamate.analisi[0].fonteId, UUID_FONTE);
  assert.equal(repository.chiamate.cacheScritte.length, 0, "nessuna riscrittura in cache");
});

test("cache: un verificato con fonte disattivata non viene riusato", async () => {
  const repository = creaRepositoryFinto({
    async leggiCache() {
      return rigaCacheDi(esitoVerificatoDiProva());
    },
    async leggiRegistro() {
      this.chiamate.registro += 1;
      return [fonte({ attiva: false })];
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.cache, false);
  assert.equal(provider.stato.chiamate, 1, "nuova analisi dopo l'invalidazione");
  assert.equal(repository.chiamate.analisi[0].provider, "finto");
  assert.equal(repository.chiamate.cacheScritte.length, 1);
  assert.equal(repository.chiamate.cacheScritte[0].fonteId, UUID_FONTE);
});

test("cache: un verificato con metadati della fonte modificati non viene riusato", async () => {
  const repository = creaRepositoryFinto({
    async leggiCache() {
      return rigaCacheDi(esitoVerificatoDiProva());
    },
    async leggiRegistro() {
      return [fonte({ territorio: "Regione Calabria" })];
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);

  assert.equal((await risposta.json()).cache, false);
  assert.equal(provider.stato.chiamate, 1);
});

test("cache: registro non disponibile su verificato => 503, mai la cache", async () => {
  const repository = creaRepositoryFinto({
    async leggiCache() {
      return rigaCacheDi(esitoVerificatoDiProva());
    },
    async leggiRegistro() {
      throw new Error("registro giù");
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).errore.codice, "REGISTRO_NON_DISPONIBILE");
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.analisi.length, 0);
});

test("cache: un non verificato viene riusato senza rileggere il registro", async () => {
  const repository = creaRepositoryFinto({
    async leggiCache() {
      return rigaCacheDi(esitoNonVerificatoDiProva());
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);

  assert.equal((await risposta.json()).cache, true);
  assert.equal(provider.stato.chiamate, 0);
  assert.equal(repository.chiamate.registro, 0);
});

test("cache: scaduta => nuova analisi", async () => {
  const chiave = creaChiaveCache(improntaContenuto(JPEG, SEGRETO_CACHE), VERSIONE_PROMPT);
  const scaduta = creaRigaCache(
    chiave,
    esitoVerificatoDiProva(),
    new Date("2026-11-18T09:00:00.000Z")
  );
  scaduta.scadeIl = "2026-11-18T09:30:00.000Z";

  const repository = creaRepositoryFinto({
    async leggiCache() {
      return scaduta;
    },
  });
  const provider = creaProviderFinto();
  const { handler } = creaAmbiente({ repository, provider });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).cache, false);
  assert.equal(provider.stato.chiamate, 1);
});

test("cache: senza RADISCAN_CACHE_SECRET l'analisi procede, il riuso no", async () => {
  const { handler, repository } = creaAmbiente({ segretoCache: null });

  const risposta = await handlerVercel(handler, richiestaMultipart());
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();

  assert.equal(corpo.success, true);
  assert.equal(corpo.cache, false);
  assert.equal(repository.chiamate.cache.length, 0, "nessuna lettura cache");
  assert.equal(repository.chiamate.cacheScritte.length, 0, "nessuna scrittura cache");
  assert.equal(repository.chiamate.analisi[0].improntaImmagine, null);
  assert.ok(!JSON.stringify(corpo).includes(SEGRETO_CACHE));
});

// ─── Impronta HMAC ─────────────────────────────────────────────────────────

test("impronta: HMAC deterministico, dipendente dal segreto, 16 esadecimali", () => {
  const impronta = improntaContenuto(JPEG, SEGRETO_CACHE);

  assert.match(impronta, /^[0-9a-f]{16}$/);
  assert.equal(impronta, improntaContenuto(JPEG, SEGRETO_CACHE));
  assert.notEqual(impronta, improntaContenuto(JPEG, SEGRETO_CACHE_2));
  assert.notEqual(impronta, improntaContenuto(PNG, SEGRETO_CACHE));
  assert.equal(improntaContenuto(JPEG, null), null);
  assert.equal(improntaContenuto(JPEG, ""), null);
  assert.equal(improntaContenuto(JPEG, "corto"), null);
});

// ─── Identità e normalizzazione IP ─────────────────────────────────────────

test("ip: su Vercel usa x-vercel-forwarded-for e ignora x-real-ip", async () => {
  const { handler, repository } = creaAmbiente();
  const richiesta = richiestaMultipart({
    headers: {
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "198.51.100.2",
    },
  });

  const risposta = await conAmbiente(
    { VERCEL: "1", RADISCAN_TRUSTED_PROXY: undefined },
    () => handler(richiesta)
  );

  assert.equal(risposta.status, 200);
  assert.equal(
    repository.chiamate.quote[0].chiave,
    creaChiaveQuotaAnonima("203.0.113.9", SALE)
  );
});

test("ip: su Vercel senza x-vercel-forwarded-for usa x-forwarded-for", async () => {
  const { handler, repository } = creaAmbiente();
  const richiesta = richiestaMultipart({
    headers: { "x-forwarded-for": "203.0.113.10", "x-real-ip": "198.51.100.1" },
  });

  const risposta = await conAmbiente(
    { VERCEL: "1", RADISCAN_TRUSTED_PROXY: undefined },
    () => handler(richiesta)
  );

  assert.equal(risposta.status, 200);
  assert.equal(
    repository.chiamate.quote[0].chiave,
    creaChiaveQuotaAnonima("203.0.113.10", SALE)
  );
});

test("ip: proxy fidato fuori da Vercel usa l'ultima voce di x-forwarded-for", async () => {
  const { handler, repository } = creaAmbiente();
  const richiesta = richiestaMultipart({
    headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.7" },
  });

  const risposta = await conAmbiente(
    { VERCEL: undefined, RADISCAN_TRUSTED_PROXY: "1" },
    () => handler(richiesta)
  );

  assert.equal(risposta.status, 200);
  assert.equal(
    repository.chiamate.quote[0].chiave,
    creaChiaveQuotaAnonima("203.0.113.7", SALE)
  );
});

test("ip: normalizzazione IPv4, IPv6, IPv4-mapped e forme non valide", () => {
  assert.equal(normalizzaIp("203.0.113.7"), "203.0.113.7");
  assert.equal(normalizzaIp("  ::FFFF:203.0.113.7 "), "203.0.113.7");
  assert.equal(normalizzaIp("[2001:db8::1]"), "2001:db8:0:0:0:0:0:1");
  assert.equal(
    normalizzaIp("2001:0DB8:0000:0000:0000:0000:0000:0001"),
    "2001:db8:0:0:0:0:0:1"
  );
  assert.equal(normalizzaIp("fe80::1%eth0"), "fe80:0:0:0:0:0:0:1");
  assert.equal(normalizzaIp("::1"), "0:0:0:0:0:0:0:1");

  assert.equal(normalizzaIp("999.0.0.1"), null);
  assert.equal(normalizzaIp("2001:db8:::1"), null);
  assert.equal(normalizzaIp("2001:db8::1::2"), null);
  assert.equal(normalizzaIp(""), null);
  assert.equal(normalizzaIp(null), null);
});

// ─── Adapter Supabase ──────────────────────────────────────────────────────

function clientFinto({ registro = [], cache = null } = {}) {
  const catturato = { insert: [], upsert: [], rpc: [], selezioni: [] };

  const client = {
    rpc(nome, parametri) {
      catturato.rpc.push({ nome, parametri });
      return Promise.resolve({
        data: [
          {
            allowed: true,
            retry_after: 0,
            reason: null,
            usati_oggi: 0,
            limite_giorno: 100,
            limite_minuto: 10,
          },
        ],
        error: null,
      });
    },
    from(tabella) {
      const selettore = {
        eq() {
          return selettore;
        },
        gt() {
          return selettore;
        },
        maybeSingle() {
          return Promise.resolve({
            data: tabella === "radiscan_cache" ? cache : null,
            error: null,
          });
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: tabella === "radiscan_fonti" ? registro : null,
            error: null,
          }).then(resolve, reject);
        },
      };

      return {
        select(colonne) {
          catturato.selezioni.push({ tabella, colonne });
          return selettore;
        },
        insert(valori) {
          catturato.insert.push({ tabella, valori });
          return Promise.resolve({ error: null });
        },
        upsert(valori, opzioni) {
          catturato.upsert.push({ tabella, valori, opzioni });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { client, catturato };
}

test("adapter: registro mappato e righe invalide scartate", async () => {
  const { client } = clientFinto({
    registro: [
      {
        id: UUID_FONTE,
        slug: "demo",
        denominazione: "Pecorino Crotonese DOP",
        tipo_atto: "denominazione",
        schema_qualita: "DOP",
        territorio: "Provincia di Crotone",
        ente: "MASAF",
        url_ufficiale: "https://www.masaf.gov.it/x",
        riferimento_normativo: "Reg. (UE) 2024/1143",
        consultata_il: "2026-11-18",
        attiva: true,
      },
      { id: "rotto" },
      null,
    ],
  });

  const repository = creaRepositorySupabase(client);
  const registro = await repository.leggiRegistro();

  assert.equal(registro.length, 1);
  assert.equal(registro[0].tipoAtto, "denominazione");
  assert.equal(registro[0].consultataIl, "2026-11-18");
});

test("adapter: cache con fonte_id, log senza immagini, RPC con i parametri 2A", async () => {
  const { client, catturato } = clientFinto();
  const repository = creaRepositorySupabase(client);

  const esito = esitoVerificatoDiProva();
  await repository.registraAnalisi({
    richiestaId: "req-1",
    modalita: "anonimo",
    utenteId: null,
    improntaImmagine: "0123456789abcdef",
    livello: esito.livello,
    esito,
    fonteId: esito.fonteId,
    denominazioneVerificata: esito.denominazioneVerificata,
    provider: "gemini",
    modello: "gemini-2.0-flash",
    durataMs: 120,
    esitoTecnico: "ok",
    codiceErrore: null,
  });

  assert.equal(catturato.insert.length, 1);
  const colonne = catturato.insert[0].valori;
  assert.equal(colonne.fonte_id, UUID_FONTE);
  assert.equal(colonne.denominazione_verificata, "Pecorino Crotonese DOP");
  assert.equal(colonne.esito.fonteId, colonne.fonte_id);
  assert.ok(!JSON.stringify(colonne).includes("base64"), "nessuna immagine nel log");

  await repository.scriviCache(
    creaRigaCache(
      creaChiaveCache("0123456789abcdef", VERSIONE_PROMPT),
      esito,
      new Date("2026-11-18T10:00:00.000Z")
    )
  );
  assert.equal(catturato.upsert.length, 1);
  assert.equal(catturato.upsert[0].opzioni.onConflict, "impronta_immagine,versione_prompt");
  assert.equal(catturato.upsert[0].valori.fonte_id, UUID_FONTE);
  assert.ok(!JSON.stringify(catturato.upsert[0].valori).includes("base64"));

  const nonVerificato = esitoNonVerificatoDiProva();
  await repository.scriviCache(
    creaRigaCache(
      creaChiaveCache("fedcba9876543210", VERSIONE_PROMPT),
      nonVerificato,
      new Date("2026-11-18T10:00:00.000Z")
    )
  );
  assert.equal(catturato.upsert[1].valori.fonte_id, null);

  const quota = await repository.consumaQuota("anon:" + "a".repeat(64), "anonimo");
  assert.equal(quota.consentita, true);
  assert.equal(catturato.rpc[0].nome, "radiscan_consume_usage");
  assert.deepEqual(Object.keys(catturato.rpc[0].parametri).sort(), [
    "p_chiave",
    "p_etichetta",
    "p_modalita",
  ]);
  assert.equal(catturato.rpc[0].parametri.p_modalita, "anonimo");
});

test("adapter: la cache letta conserva fonte_id e log accetta impronta assente", async () => {
  const esito = esitoVerificatoDiProva();
  const cache = {
    impronta_immagine: "0123456789abcdef",
    versione_prompt: VERSIONE_PROMPT,
    livello: "verificato",
    esito,
    fonte_id: UUID_FONTE,
    creato_il: "2026-11-18T09:00:00.000Z",
    scade_il: "2026-12-18T09:00:00.000Z",
  };
  const { client, catturato } = clientFinto({ cache });
  const repository = creaRepositorySupabase(client);

  const riga = await repository.leggiCache(
    creaChiaveCache("0123456789abcdef", VERSIONE_PROMPT),
    new Date("2026-11-18T10:00:00.000Z")
  );
  assert.equal(riga.fonteId, UUID_FONTE);

  await repository.registraAnalisi({
    richiestaId: "req-2",
    modalita: "anonimo",
    utenteId: null,
    improntaImmagine: null,
    livello: esito.livello,
    esito,
    fonteId: esito.fonteId,
    denominazioneVerificata: esito.denominazioneVerificata,
    provider: "gemini",
    modello: "gemini-2.0-flash",
    durataMs: null,
    esitoTecnico: "ok",
    codiceErrore: null,
  });
  assert.equal(catturato.insert[0].valori.impronta_immagine, null);
});

// ─── Cablaggio della route ─────────────────────────────────────────────────

test("route file: solo cablaggio, nessun import proibito", () => {
  const sorgente = readFileSync(radice("app/api/radiscan/analisi/route.ts"), "utf8");

  assert.match(sorgente, /export async function POST/);
  assert.match(sorgente, /export const runtime = "nodejs"/);
  assert.match(sorgente, /export const dynamic = "force-dynamic"/);
  assert.match(sorgente, /createServerSupabaseClient/);
  assert.match(sorgente, /createAdminSupabaseClient/);
  assert.match(sorgente, /creaProviderGemini/);
  assert.match(sorgente, /process\.env\.RADISCAN_QUOTA_SALT/);
  assert.match(sorgente, /process\.env\.RADISCAN_CACHE_SECRET/);
  assert.ok(!sorgente.includes("GEMINI_API_KEY"), "la chiave non deve comparire nella route");

  for (const vietato of [
    "product-assistant",
    "scan-log",
    "rate-limiter",
    "components/merchant",
    "vision-core",
    "components/vision",
  ]) {
    assert.ok(!sorgente.includes(vietato), `la route importa ${vietato}`);
  }
});
