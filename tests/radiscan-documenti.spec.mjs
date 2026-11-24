/**
 * RADICISCAN — LETTURA DELLA DOCUMENTAZIONE UFFICIALE
 *
 * Nessuna rete reale: il `fetch` è iniettato e i PDF sono costruiti nel test.
 * Verifica i punti dell'incarico che riguardano la documentazione:
 * allegati reali, pagine multiple, scansioni, allegati mancanti, timeout,
 * risposte malformate, distinzione fra denominazione e confezione, e il
 * divieto di dichiarare una lettura completa che non lo è.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-documenti.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

const radiscan = await import("@/lib/radiscan");
const {
  creaRicercaEAmbrosia,
  estraiTestoPdf,
  leggiAllegati,
  urlAllegatoEAmbrosia,
  isUrlAllegatoEAmbrosia,
  verificaDenominazione,
  componiEsito,
  VERSIONE_PROMPT,
} = radiscan;

const URL_ATTACHMENT = "https://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments/71454";

function creaPdf(pagine, { comprimi = false } = {}) {
  const parti = [Buffer.from("%PDF-1.4\n", "latin1")];
  const kids = pagine.map((_, indice) => `${3 + indice * 2} 0 R`).join(" ");

  parti.push(
    Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`, "latin1")
  );
  parti.push(
    Buffer.from(
      `2 0 obj\n<< /Type /Pages /Count ${pagine.length} /Kids [${kids}] >>\nendobj\n`,
      "latin1"
    )
  );

  pagine.forEach((testo, indice) => {
    const numeroPagina = 3 + indice * 2;
    const numeroContenuto = numeroPagina + 1;
    const contenuto = `BT /F1 12 Tf 72 720 Td (${testo}) Tj ET`;
    const dati = comprimi
      ? deflateSync(Buffer.from(contenuto, "latin1"))
      : Buffer.from(contenuto, "latin1");
    const dizionario = comprimi
      ? `<< /Length ${dati.length} /Filter /FlateDecode >>`
      : `<< /Length ${dati.length} >>`;

    parti.push(
      Buffer.from(
        `${numeroPagina} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${numeroContenuto} 0 R >>\nendobj\n`,
        "latin1"
      ),
      Buffer.from(`${numeroContenuto} 0 obj\n${dizionario}\nstream\n`, "latin1"),
      dati,
      Buffer.from("\nendstream\nendobj\n", "latin1")
    );
  });

  parti.push(
    Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1")
  );
  return Buffer.concat(parti);
}

function creaPdfScansionato() {
  const contenuto = Buffer.from("q 595 0 0 842 0 0 cm /Im1 Do Q", "latin1");
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n", "latin1"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from(
      "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
      "latin1"
    ),
    Buffer.from(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n",
      "latin1"
    ),
    Buffer.from(`4 0 obj\n<< /Length ${contenuto.length} >>\nstream\n`, "latin1"),
    contenuto,
    Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"),
  ]);
}

function rispostaPdf(bytes, stato = 202) {
  return new Response(bytes, {
    status: stato,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline; filename=allegato.pdf",
    },
  });
}

function allegato(override = {}) {
  return {
    id: "71454",
    titolo: "IT_0117_0003_SUM_IT_O.pdf",
    url: URL_ATTACHMENT,
    tipo: "riepilogo",
    ...override,
  };
}

function prova(override = {}) {
  return {
    id: "eambrosia:EUGI00000014301",
    tipo: "ufficiale",
    denominazione: "Pecorino Crotonese",
    schemaQualita: "DOP",
    ente: "Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)",
    titolo: "eAmbrosia — Pecorino Crotonese (PDO)",
    url: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000014301",
    riferimentoNormativo: "Official Journal L 341, 27.11.2014",
    riferimentoUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    documentoUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    estratto: "Scheda EUGI00000014301 · stato: registrata · tipo: PDO",
    consultataIl: "2026-11-20",
    relazione: "Corrispondenza esatta con la denominazione letta.",
    stato: "registrata",
    allegati: [allegato()],
    gruppoProduttori: "Consorzio di tutela della DOP Pecorino Crotonese",
    sedeGruppo: "Via XXV Aprile n. 62\n88900 - CROTONE",
    ...override,
  };
}

function letturaCompleta() {
  return {
    stato: "completa",
    documenti: [
      {
        id: "71454",
        titolo: "IT_0117_0003_SUM_IT_O.pdf",
        url: URL_ATTACHMENT,
        tipo: "riepilogo",
        stato: "letto",
        pagineTotali: 2,
        pagineLette: 2,
        pagineNonLette: 0,
        motivo: null,
        sezioni: [
          { pagina: 1, testo: "Zona di produzione: provincia di Crotone, Calabria." },
          { pagina: 2, testo: "Metodo di ottenimento e controlli." },
        ],
        troncato: false,
      },
    ],
    pagineLette: 2,
    pagineTotali: 2,
    consultataIl: "2026-11-20",
    messaggio: "2 pagine lette in 1 documento su 1 allegati.",
    notaPagine: null,
  };
}

function riconoscimento(override = {}) {
  return {
    prodotto: "Formaggio pecorino",
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

function ricercaCon(override = {}) {
  return {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-20",
    query: ["pecorino crotonese"],
    prove: [prova()],
    messaggio: null,
    lettura: letturaCompleta(),
    ...override,
  };
}

// ─── Estrazione PDF ────────────────────────────────────────────────────────

test("pdf: legge tutte le pagine di un PDF non compresso", () => {
  const pdf = creaPdf([
    "Pecorino Crotonese DOP — disciplinare",
    "Zona di produzione: provincia di Crotone",
  ]);
  const esito = estraiTestoPdf(pdf);

  assert.equal(esito.pagine.length, 2);
  assert.equal(esito.pagineTotali, 2);
  assert.match(esito.pagine[0].testo, /Pecorino Crotonese/);
  assert.match(esito.pagine[1].testo, /provincia di Crotone/);
  assert.equal(esito.pagine[0].numero, 1);
  assert.equal(esito.pagine[1].numero, 2);
});

test("pdf: decodifica i flussi FlateDecode come quelli eAmbrosia", () => {
  const pdf = creaPdf(["Caciocavallo Silano DOP"], { comprimi: true });
  const esito = estraiTestoPdf(pdf);

  assert.equal(esito.pagine.length, 1);
  assert.match(esito.pagine[0].testo, /Caciocavallo Silano/);
});

test("pdf: una scansione non viene dichiarata letta e non inventa OCR", () => {
  const esito = estraiTestoPdf(creaPdfScansionato());

  assert.equal(esito.pagine.length, 0);
  assert.ok(
    esito.note.some((nota) => /OCR non eseguito/i.test(nota)),
    "il motivo deve dichiarare l'assenza di OCR"
  );
});

test("pdf: un file che non è PDF non produce pagine", () => {
  const esito = estraiTestoPdf(Buffer.from("<html>errore</html>", "latin1"));
  assert.equal(esito.pagine.length, 0);
  assert.match(esito.note[0], /non è un PDF/i);
});

// ─── Download e completezza ────────────────────────────────────────────────

test("documenti: accetta il 202 reale e dichiara la lettura completa", async () => {
  const richieste = [];
  const esito = await leggiAllegati([allegato()], {
    fetchImpl: async (url, init) => {
      richieste.push({ url: String(url), init });
      return rispostaPdf(creaPdf(["Pecorino Crotonese", "Crotone, Calabria"]), 202);
    },
    adesso: () => new Date("2026-11-20T10:00:00.000Z"),
  });

  assert.equal(richieste[0].url, URL_ATTACHMENT);
  assert.equal(richieste[0].init.redirect, "error");
  assert.equal(esito.stato, "completa");
  assert.equal(esito.pagineLette, 2);
  assert.equal(esito.pagineTotali, 2);
  assert.equal(esito.documenti[0].stato, "letto");
  assert.equal(esito.documenti[0].tipo, "riepilogo");
  assert.match(esito.messaggio, /2 pagine lette/i);
});

test("documenti: un 404 resta non_disponibile, non diventa assenza di fonti", async () => {
  const esito = await leggiAllegati([allegato()], {
    fetchImpl: async () => new Response("", { status: 404 }),
  });

  assert.equal(esito.stato, "non_disponibile");
  assert.equal(esito.documenti[0].stato, "non_disponibile");
  assert.match(esito.documenti[0].motivo, /404/);
  assert.match(esito.messaggio, /non scaricato/i);
});

test("documenti: il corpo oltre il limite viene interrotto durante il download", async () => {
  const esito = await leggiAllegati([allegato()], {
    maxBytes: 1_000,
    fetchImpl: async () =>
      new Response(new Uint8Array(5_000), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
  });

  assert.equal(esito.documenti[0].stato, "non_disponibile");
  assert.match(esito.documenti[0].motivo, /limite/i);
  assert.equal(esito.stato, "non_disponibile");
});

test("documenti: un allegato non PDF è scaricato ma non estraibile", async () => {
  const esito = await leggiAllegati([allegato()], {
    fetchImpl: async () =>
      new Response("<html>errore</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  });

  assert.equal(esito.documenti[0].stato, "non_estraibile");
  assert.equal(esito.stato, "non_disponibile");
  assert.match(esito.messaggio, /senza testo estraibile/i);
});

test("documenti: timeout e interruzione di rete non lanciano", async () => {
  const mai = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const errore = new Error("aborted");
        errore.name = "AbortError";
        reject(errore);
      });
    });

  const esito = await leggiAllegati([allegato()], {
    fetchImpl: mai,
    timeoutDocumentoMs: 30,
    timeoutTotaleMs: 5_000,
  });

  assert.equal(esito.stato, "non_disponibile");
  assert.equal(esito.documenti[0].stato, "non_disponibile");
  assert.match(esito.documenti[0].motivo, /Download interrotto/i);
});

test("documenti: il limite di pagine produce parziale, mai completa", async () => {
  const esito = await leggiAllegati([allegato()], {
    fetchImpl: async () => rispostaPdf(creaPdf(["uno", "due", "tre", "quattro"])),
    maxPagine: 2,
  });

  assert.equal(esito.documenti[0].pagineLette, 2);
  assert.equal(esito.documenti[0].pagineNonLette, 2);
  assert.equal(esito.documenti[0].stato, "parziale");
  assert.equal(esito.documenti[0].troncato, true);
  assert.equal(esito.stato, "parziale");
  assert.match(esito.messaggio, /in parte/i);
  assert.doesNotMatch(esito.messaggio, /lettura completa/i);
});

test("documenti: senza allegati la lettura è dichiarata non_tentata", async () => {
  const esito = await leggiAllegati([], {});
  assert.equal(esito.stato, "non_tentata");
  assert.equal(esito.pagineLette, 0);
  assert.match(esito.messaggio, /non pubblica allegati/i);
});

test("documenti: un URL fuori dall'endpoint ufficiale non viene scaricato", async () => {
  let chiamate = 0;
  const esito = await leggiAllegati(
    [allegato({ url: "https://evil.example/api/v1/attachments/71454" })],
    {
      fetchImpl: async () => {
        chiamate += 1;
        return rispostaPdf(creaPdf(["x"]));
      },
    }
  );

  assert.equal(chiamate, 0);
  assert.equal(esito.documenti[0].stato, "non_disponibile");
  assert.equal(esito.stato, "non_disponibile");

  assert.equal(isUrlAllegatoEAmbrosia(URL_ATTACHMENT), true);
  assert.equal(isUrlAllegatoEAmbrosia("http://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments/71454"), false);
  assert.equal(isUrlAllegatoEAmbrosia("https://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments/../x"), false);
  assert.equal(urlAllegatoEAmbrosia("abc"), null);
});

// ─── Ricerca eAmbrosia con allegati reali ──────────────────────────────────

const RIGA_REALE = {
  giIdentifier: "EUGI00000014301",
  protectedNames: ["Pecorino Crotonese"],
  fileNumber: "PDO-IT-1111",
  countries: ["IT"],
  giType: "PDO",
  status: "registered",
  euProtectionDate: "2013-05-13",
  legalInstrument: { text: "Official Journal L 341, 27.11.2014", uri: "https://eur-lex.europa.eu/x" },
  publications: [],
  singleDocument: { text: "IT_1111_SPEC.pdf", uri: "71454" },
  summarySheets: [
    { text: "IT_1111_SUM_EN.pdf", uri: "71450" },
    { text: "IT_1111_SUM_IT_O.pdf", uri: "60570" },
  ],
  producerGroupName: "Consorzio di tutela della DOP Pecorino Crotonese",
  producerGroupAdress: "Via XXV Aprile n. 62\n88900 - CROTONE",
  removedFlag: false,
};

test("ricerca: usa singleDocument e summarySheets reali (uri = id allegato)", async () => {
  const richieste = [];
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async (url) => {
      richieste.push(String(url));
      if (String(url).includes("/api/v1/attachments/")) {
        return rispostaPdf(creaPdf(["Disciplinare: Crotone, Calabria"]));
      }
      return new Response(JSON.stringify([RIGA_REALE]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    adesso: () => new Date("2026-11-20T10:00:00.000Z"),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  const provaOttenuta = esito.prove[0];

  assert.equal(esito.stato, "ok");
  assert.equal(provaOttenuta.gruppoProduttori, "Consorzio di tutela della DOP Pecorino Crotonese");
  assert.match(provaOttenuta.sedeGruppo, /CROTONE/);
  assert.equal(provaOttenuta.allegati[0].tipo, "disciplinare");
  assert.equal(provaOttenuta.allegati[0].url, URL_ATTACHMENT);
  assert.ok(
    provaOttenuta.allegati.some((voce) => voce.titolo === "IT_1111_SUM_IT_O.pdf"),
    "il riepilogo italiano va preferito"
  );
  assert.equal(esito.lettura.stato, "completa");
  assert.equal(esito.lettura.documenti[0].pagineLette, 1);
  assert.ok(richieste.some((url) => url.includes("/api/v1/attachments/")));
});

test("ricerca: un allegato mancante non blocca la ricerca né la dichiara letta", async () => {
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async (url) => {
      if (String(url).includes("/attachments/")) {
        return new Response("", { status: 404 });
      }
      return new Response(JSON.stringify([RIGA_REALE]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  assert.equal(esito.prove.length, 1);
  assert.equal(esito.lettura.stato, "non_disponibile");
  assert.match(esito.lettura.messaggio, /non scaricato/i);
});

test("ricerca: allegati malformati non producono URL inventati", async () => {
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            ...RIGA_REALE,
            singleDocument: { text: "x.pdf", uri: "../../etc/passwd" },
            summarySheets: "non un elenco",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  assert.deepEqual(esito.prove[0].allegati, []);
  assert.equal(esito.lettura.stato, "non_tentata");
});

// ─── Verifica: denominazione ≠ confezione ≠ filiera ────────────────────────

test("verifica: i documenti letti non alzano il livello oltre il registro curato", () => {
  const esito = verificaDenominazione(riconoscimento(), [], ricercaCon());

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.equal(esito.provenienza.confezione.stato, "non_verificabile");
  assert.match(esito.provenienza.confezione.messaggio, /non è la verifica della confezione/i);
  assert.equal(esito.provenienza.territorio.stato, "documentato");
  assert.match(esito.provenienza.territorio.evidenze[0].estratto, /CROTONE/);
  assert.equal(esito.provenienza.filiera.stato, "documentato");
  assert.match(esito.provenienza.filiera.motivo, /non dimostra.*aderisca/is);
  assert.match(esito.motivazione, /Lettura documentale/);
});

test("verifica: un nome calabrese non è prova di filiera né di provenienza", () => {
  const esito = verificaDenominazione(
    riconoscimento({ territorioProposto: "Calabria" }),
    [],
    ricercaCon({
      prove: [prova({ gruppoProduttori: null, sedeGruppo: null })],
      lettura: null,
    })
  );

  assert.equal(esito.provenienza.territorio.stato, "non_documentato");
  assert.match(esito.provenienza.territorio.motivo, /non è una fonte documentale/i);
  assert.equal(esito.provenienza.filiera.stato, "non_documentato");
  assert.equal(esito.provenienza.filiera.evidenze.length, 0);
});

test("verifica: una lettura parziale resta dichiarata nella motivazione", () => {
  const parziale = {
    ...letturaCompleta(),
    stato: "parziale",
    messaggio: "1 pagina letta in 1 documento su 1 allegati. 1 documento/i letto/i solo in parte.",
  };
  const esito = verificaDenominazione(riconoscimento(), [], ricercaCon({ lettura: parziale }));

  assert.match(esito.motivazione, /solo in parte/i);
  assert.equal(esito.provenienza.confezione.stato, "non_verificabile");
});

test("verifica: senza prova documentale la provenienza è non verificabile", () => {
  const esito = verificaDenominazione(
    riconoscimento(),
    [],
    ricercaCon({ prove: [], lettura: null })
  );

  assert.equal(esito.provenienza.territorio.stato, "non_verificabile");
  assert.equal(esito.provenienza.filiera.stato, "non_verificabile");
  assert.equal(esito.provenienza.confezione.stato, "non_verificabile");
});

test("livelli: la provenienza viaggia con l'esito persistito", () => {
  const verifica = verificaDenominazione(riconoscimento(), [], ricercaCon());
  const esito = componiEsito({
    riconoscimento: riconoscimento(),
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.verifica.provenienza.territorio.stato, "documentato");
  assert.equal(esito.verifica.ricerca.lettura.stato, "completa");
  assert.ok(JSON.stringify(esito).includes("non_verificabile"));
});
