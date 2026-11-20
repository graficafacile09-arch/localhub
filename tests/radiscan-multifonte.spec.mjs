/**
 * RADICISCAN — IDENTIFICAZIONE MULTIFONTE
 *
 * Nessuna rete reale: `fetch` e motore OCR sono iniettati. I test coprono
 * OCR, estrazione etichetta, controllo incrociato, barcode, ricerca web con
 * classificazione delle fonti, cache, parallelismo, lettura documentale
 * completa e verifica separata del produttore.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-multifonte.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

const radiscan = await import("@/lib/radiscan");
const {
  leggiEtichettaOcr,
  estraiEtichetta,
  validaBarcode,
  cercaBarcode,
  creaRicercaWeb,
  estraiRisultati,
  urlRisultato,
  svuotaCacheWeb,
  verificaProduttore,
  verificaDenominazione,
  creaProviderGemini,
  leggiAllegati,
  analizzaProdotto,
  LIMITI_LETTURA,
} = radiscan;

const TESTO_ETICHETTA = [
  "CACIOCAVALLO SILANO",
  "D.O.P. Denominazione di Origine Protetta",
  "Prodotto da: Caseificio San Lorenzo S.r.l.",
  "Stabilimento di Cosenza (CS)",
  "Lotto: L26A117",
  "Ingredienti: latte, caglio, sale",
  "EAN 8 001505 005707",
  "Regione Calabria - provincia di Cosenza",
].join("\n");

function ocr(override = {}) {
  return {
    stato: "ok",
    testo: TESTO_ETICHETTA,
    confidenza: 88,
    paroleLette: 30,
    caratteri: TESTO_ETICHETTA.length,
    lingue: ["ita", "eng"],
    durataMs: 900,
    motivo: null,
    avvisi: [],
    ...override,
  };
}

function riconoscimento(override = {}) {
  return {
    prodotto: "Caciocavallo Silano",
    categoria: "Formaggi",
    denominazioneProposta: "Caciocavallo Silano DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
    ...override,
  };
}

// ─── Retry Gemini ────────────────────────────────────────────────────────

test("gemini: ritenta una sola volta dopo un timeout transitorio del tentativo", async () => {
  let chiamate = 0;
  const provider = creaProviderGemini({
    apiKey: "test-key",
    timeoutMs: 2_000,
    fetchImpl: async () => {
      chiamate += 1;
      if (chiamate === 1) {
        throw new DOMException("timeout transitorio", "AbortError");
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{\\"prodotto\\":\\"Caciocavallo Silano\\"}" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  const risultato = await provider.genera({
    prompt: "test",
    immagineBase64: "AQID",
    mimeType: "image/jpeg",
  });
  assert.equal(chiamate, 2);
  assert.match(risultato.testo, /Caciocavallo Silano/);
});

// ─── OCR ──────────────────────────────────────────────────────────────────

test("ocr: usa il motore iniettato e conserva la lettura separata", async () => {
  const esito = await leggiEtichettaOcr(Buffer.from([1, 2, 3]), {
    motore: {
      async riconosci() {
        return { testo: TESTO_ETICHETTA, confidenza: 88, parole: 30 };
      },
    },
  });

  assert.equal(esito.stato, "ok");
  assert.match(esito.testo, /CACIOCAVALLO SILANO/);
  assert.equal(esito.confidenza, 88);
  assert.equal(esito.paroleLette, 30);
  assert.ok(esito.durataMs >= 0);
});

test("ocr: un motore che fallisce o non risponde è non_disponibile, non un errore fatale", async () => {
  const rotto = await leggiEtichettaOcr(Buffer.from([1]), {
    motore: {
      async riconosci() {
        throw new Error("modello assente");
      },
    },
  });
  assert.equal(rotto.stato, "non_disponibile");
  assert.match(rotto.motivo, /non disponibile/i);

  const lento = await leggiEtichettaOcr(Buffer.from([1]), {
    motore: { riconosci: () => new Promise(() => {}) },
    timeoutMs: 25,
  });
  assert.equal(lento.stato, "non_disponibile");
  assert.match(lento.motivo, /tempo previsto/i);
});

// ─── Etichetta e controllo incrociato ─────────────────────────────────────

test("etichetta: estrae produttore, stabilimento, lotto, ingredienti e codice a barre", () => {
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), riconoscimento());

  assert.equal(etichetta.produttore.valore, "Caseificio San Lorenzo S.r.l.");
  assert.equal(etichetta.produttore.fonte, "ocr");
  assert.match(etichetta.stabilimento.valore, /Cosenza/);
  assert.equal(etichetta.lotto.valore, "L26A117");
  assert.equal(etichetta.codiceBarre.valore, "8001505005707");
  assert.ok(etichetta.ingredienti.includes("latte"));
  assert.ok(etichetta.certificazioni.includes("DOP"));
  assert.ok(etichetta.territorioDichiarato.includes("Calabria"));
  assert.equal(etichetta.leggibilita, "buona");
  assert.equal(discrepanze.length, 0);
});

test("etichetta: OCR e modello in disaccordo producono discrepanze, senza scegliere un vincitore", () => {
  const ai = riconoscimento({
    schemaProposto: "IGP",
    produttore: "Caseificio Rossi S.p.A.",
    lotto: "L99Z000",
    codiceBarre: "12345670",
  });
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), ai);

  const campi = discrepanze.map((voce) => voce.campo);
  assert.ok(campi.includes("schema_qualita"));
  assert.ok(campi.includes("produttore"));
  assert.ok(campi.includes("lotto"));
  assert.ok(campi.includes("codice_a_barre"));
  assert.ok(discrepanze.some((voce) => voce.gravita === "media"));
  assert.equal(etichetta.produttore.valore, "Caseificio San Lorenzo S.r.l.");
});

test("etichetta: una sigla qualità non letta dall'OCR resta una discrepanza", () => {
  const testo = "CACIOCAVALLO\nProdotto da: Caseificio San Lorenzo S.r.l.";
  const { discrepanze } = estraiEtichetta(ocr({ testo }), riconoscimento());
  assert.ok(
    discrepanze.some(
      (voce) => voce.campo === "certificazione" && /non legge quella sigla/i.test(voce.messaggio)
    )
  );
});

test("etichetta: PAT è dichiarato tradizionale, mai certificazione di origine", () => {
  const { discrepanze } = estraiEtichetta(
    ocr({ testo: `${TESTO_ETICHETTA}\nP.A.T.` }),
    riconoscimento({ schemaProposto: "PAT", denominazioneProposta: "Caciocavallo Silano PAT" })
  );
  const pat = discrepanze.find((voce) => voce.campo === "natura_pat");
  assert.ok(pat);
  assert.match(pat.messaggio, /non è una certificazione di origine/i);
});

// ─── Barcode ──────────────────────────────────────────────────────────────

test("barcode: valida il checksum EAN-13 e rifiuta un codice inventato", () => {
  assert.equal(validaBarcode("8001505005707").valido, true);
  assert.equal(validaBarcode("8001505005707").tipo, "EAN-13");
  assert.equal(validaBarcode("8001505005708").valido, false);
  assert.equal(validaBarcode("12ab").valido, false);
});

test("barcode: un codice non valido non interroga la banca dati", async () => {
  let chiamate = 0;
  const scheda = await cercaBarcode("8001505005708", {
    fetchImpl: async () => {
      chiamate += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(chiamate, 0);
  assert.equal(scheda.trovato, false);
  assert.match(scheda.messaggio, /non valido/i);
});

test("barcode: OpenFoodFacts restituisce una scheda, non una certificazione", async () => {
  const scheda = await cercaBarcode("8001505005707", {
    fetchImpl: async (url) => {
      assert.match(String(url), /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/8001505005707\.json/);
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Caciocavallo Silano",
            brands: "Caseificio Demo",
            labels: "DOP",
            manufacturing_places: "Cosenza",
            categories: "Formaggi",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  assert.equal(scheda.trovato, true);
  assert.equal(scheda.fonte, "OpenFoodFacts");
  assert.equal(scheda.attendibilita, "media");
  assert.match(scheda.messaggio, /non.*certificarne/i);
});

test("barcode: rete assente è distinta da prodotto assente", async () => {
  const scheda = await cercaBarcode("8001505005707", {
    fetchImpl: async () => {
      throw new Error("rete");
    },
  });
  assert.equal(scheda.trovato, false);
  assert.match(scheda.messaggio, /non raggiungibile/i);
});

// ─── Ricerca web ──────────────────────────────────────────────────────────

function paginaRisultati() {
  return `<html><body>
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.masaf.gov.it%2Fregistro&rut=a" class='result-link'>MASAF — Registro nazionale DOP IGP</a>
    <td class='result-snippet'>Scheda ufficiale del Caciocavallo Silano DOP</td>
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example.com%2Fp&rut=b" class='result-link'>Acquista Caciocavallo</a>
    <td class='result-snippet'>Prezzo e offerte del prodotto</td>
  </body></html>`;
}

test("web: classifica le fonti e legge davvero la pagina istituzionale", async () => {
  svuotaCacheWeb();
  const chiamate = [];
  const provider = creaRicercaWeb({
    leggiPagineUfficiali: true,
    fetchImpl: async (url) => {
      chiamate.push(String(url));
      if (String(url).includes("lite.duckduckgo.com")) {
        return new Response(paginaRisultati(), {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(
        "<html><head><style>x{}</style></head><body><h1>Registro nazionale</h1><p>Caciocavallo Silano DOP — zona di produzione Calabria.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } }
      );
    },
    adesso: () => new Date("2026-11-20T10:00:00Z"),
  });

  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  assert.equal(esito.stato, "ok");
  assert.ok(esito.fonti.length >= 2);

  const masaf = esito.fonti.find((fonte) => fonte.dominio === "www.masaf.gov.it");
  assert.ok(masaf);
  assert.equal(masaf.natura, "ufficiale_it");
  assert.equal(masaf.attendibilita, "alta");
  assert.equal(masaf.lettoIntegralmente, true);
  assert.match(masaf.estratto, /Registro nazionale/);
  assert.ok(!/style|h1/.test(masaf.estratto));

  const commerciale = esito.fonti.find((fonte) => fonte.dominio === "shop.example.com");
  assert.equal(commerciale.natura, "commerciale");
  assert.equal(commerciale.attendibilita, "bassa");
});

test("web: nomi simili non rendono ufficiali domini contraffatti o consorzi autoproclamati", async () => {
  svuotaCacheWeb();
  const html = `
    <a href="https://arsac-falso.example/prodotti" class='result-link'>ARSAC — elenco prodotti</a>
    <td class='result-snippet'>Fonte regionale ufficiale</td>
    <a href="https://consorzio-finto.example/registro" class='result-link'>Consorzio di tutela demo</a>
    <td class='result-snippet'>Registro produttori</td>
    <a href="https://openfoodfacts-falso.example/prodotto" class='result-link'>OpenFoodFacts</a>
    <td class='result-snippet'>Scheda prodotto</td>`;
  const esito = await creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async () => new Response(html, { status: 200 }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.ok(esito.fonti.length >= 3);
  assert.ok(esito.fonti.every((fonte) =>
    fonte.natura !== "regionale" &&
    fonte.natura !== "consorzio" &&
    fonte.natura !== "database_prodotti"
  ));
  assert.ok(esito.fonti.every((fonte) => fonte.attendibilita !== "alta"));
});

test("web: ARSAC è regionale solo sul dominio ufficiale esatto", async () => {
  svuotaCacheWeb();
  const html = `
    <a href="https://www.arsacweb.it/prodotti" class='result-link'>ARSAC — PAT Calabria</a>
    <td class='result-snippet'>Elenco prodotti tradizionali</td>`;
  const esito = await creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async () => new Response(html, { status: 200 }),
  }).cerca({ riconoscimento: riconoscimento() });

  const arsac = esito.fonti.find((fonte) => fonte.dominio === "www.arsacweb.it");
  assert.ok(arsac);
  assert.equal(arsac.natura, "regionale");
  assert.equal(arsac.attendibilita, "alta");
  assert.equal(arsac.lettoIntegralmente, false);
});

test("web: la cache evita di ripetere le stesse query", async () => {
  svuotaCacheWeb();
  let ricerche = 0;
  const provider = creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async (url) => {
      if (String(url).includes("lite.duckduckgo.com")) ricerche += 1;
      return new Response(paginaRisultati(), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });

  const primo = await provider.cerca({ riconoscimento: riconoscimento() });
  const dopoPrimo = ricerche;
  const secondo = await provider.cerca({ riconoscimento: riconoscimento() });

  assert.ok(dopoPrimo > 0);
  assert.equal(ricerche, dopoPrimo);
  assert.deepEqual(secondo.fonti.map((fonte) => fonte.url), primo.fonti.map((fonte) => fonte.url));
});

test("web: le query indipendenti sono eseguite in parallelo", async () => {
  svuotaCacheWeb();
  const provider = creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response(paginaRisultati(), { status: 200 });
    },
  });

  const avvio = Date.now();
  const esito = await provider.cerca({ riconoscimento: riconoscimento() });
  const durata = Date.now() - avvio;

  assert.equal(esito.stato, "ok");
  assert.ok(durata < 160, `attesa sequenziale rilevata: ${durata} ms`);
});

test("web: un errore totale è non_disponibile, non assenza di fonti", async () => {
  svuotaCacheWeb();
  const esito = await creaRicercaWeb({
    fetchImpl: async () => new Response("", { status: 503 }),
  }).cerca({ riconoscimento: riconoscimento() });

  assert.equal(esito.stato, "non_disponibile");
  assert.deepEqual(esito.fonti, []);
  assert.match(esito.messaggio, /non dimostra l'assenza/i);
});

test("web: URL non https, IP e credenziali sono scartati", () => {
  assert.equal(urlRisultato("http://www.masaf.gov.it/x"), null);
  assert.equal(urlRisultato("https://127.0.0.1/x"), null);
  assert.equal(urlRisultato("https://user:pass@www.masaf.gov.it/x"), null);
  assert.equal(
    urlRisultato("https://www.masaf.gov.it/x?y=1"),
    "https://www.masaf.gov.it/x?y=1"
  );

  const risultati = estraiRisultati(
    `<a href="https://127.0.0.1/x" class='result-link'>Locale</a><td class='result-snippet'>no</td>`
  );
  assert.deepEqual(risultati, []);
});

// ─── Lettura documentale completa ─────────────────────────────────────────

function creaPdf(pagine) {
  const parti = [Buffer.from("%PDF-1.4\n", "latin1")];
  const kids = pagine.map((_, indice) => `${3 + indice * 2} 0 R`).join(" ");
  parti.push(Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"));
  parti.push(
    Buffer.from(
      `2 0 obj\n<< /Type /Pages /Count ${pagine.length} /Kids [${kids}] >>\nendobj\n`,
      "latin1"
    )
  );
  pagine.forEach((testo, indice) => {
    const pagina = 3 + indice * 2;
    const contenuto = `BT /F1 12 Tf 72 720 Td (${testo}) Tj ET`;
    const dati = deflateSync(Buffer.from(contenuto, "latin1"));
    parti.push(
      Buffer.from(
        `${pagina} 0 obj\n<< /Type /Page /Parent 2 0 R /Contents ${pagina + 1} 0 R >>\nendobj\n`,
        "latin1"
      ),
      Buffer.from(
        `${pagina + 1} 0 obj\n<< /Length ${dati.length} /Filter /FlateDecode >>\nstream\n`,
        "latin1"
      ),
      dati,
      Buffer.from("\nendstream\nendobj\n", "latin1")
    );
  });
  parti.push(Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
  return Buffer.concat(parti);
}

function allegato(id) {
  return {
    id,
    titolo: `doc-${id}.pdf`,
    url: `https://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments/${id}`,
    tipo: "riepilogo",
  };
}

test("documenti: legge tutti gli allegati disponibili, non solo due", async () => {
  const allegati = [allegato("10001"), allegato("10002"), allegato("10003"), allegato("10004")];
  const esito = await leggiAllegati(allegati, {
    fetchImpl: async () =>
      new Response(creaPdf(["zona di produzione Calabria", "requisiti"]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
  });

  assert.equal(esito.documenti.length, 4);
  assert.equal(esito.stato, "completa");
  assert.equal(esito.pagineLette, 8);
  assert.equal(LIMITI_LETTURA.maxDocumenti, Number.POSITIVE_INFINITY);
});

test("documenti: il budget complessivo produce parziale e dichiara il taglio", async () => {
  const esito = await leggiAllegati([allegato("10001")], {
    fetchImpl: async () =>
      new Response(creaPdf(["abcdefghij", "klmnopqrst"]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    maxCaratteriTotali: 12,
  });

  assert.equal(esito.documenti[0].stato, "parziale");
  assert.equal(esito.documenti[0].troncato, true);
  assert.match(esito.documenti[0].motivo, /budget/i);
  assert.equal(esito.stato, "parziale");
});

// ─── Produttore e filiera ─────────────────────────────────────────────────

test("verifica: una DOP esatta e registrata in eAmbrosia non è un riscontro parziale", () => {
  const prova = {
    id: "eambrosia:EU00001",
    tipo: "ufficiale",
    denominazione: "Caciocavallo Silano",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "eAmbrosia — Caciocavallo Silano (PDO)",
    url: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EU00001",
    riferimentoNormativo: "Regolamento UE di registrazione",
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: "Stato: registrata · tipo PDO",
    consultataIl: "2026-11-20",
    relazione: "Corrispondenza esatta con la denominazione letta",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
  };
  const ricerca = {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-20",
    query: ["caciocavallo silano"],
    prove: [prova],
    messaggio: null,
    lettura: {
      stato: "completa",
      documenti: [{
        id: "10001",
        titolo: "disciplinare.pdf",
        url: "https://webgate.ec.europa.eu/eambrosia-api/api/v1/attachments/10001",
        tipo: "disciplinare",
        stato: "letto",
        associazionePagine: "pagine",
        pagineTotali: 1,
        pagineLette: 1,
        pagineNonLette: 0,
        motivo: null,
        sezioni: [{ pagina: 1, testo: "Disciplinare della DOP Caciocavallo Silano: zona di produzione e requisiti." }],
        troncato: false,
      }],
      pagineLette: 1,
      pagineTotali: 1,
      consultataIl: "2026-11-20",
      messaggio: "Lettura completa.",
      notaPagine: null,
    },
  };

  const esito = verificaDenominazione(riconoscimento(), [], ricerca);
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.match(esito.motivazione, /Denominazione DOP confermata/i);
  assert.doesNotMatch(esito.motivazione, /riscontro parziale/i);
  assert.match(esito.motivazione, /non costituiscono autenticazione della singola confezione/i);
});

test("produttore: la denominazione DOP non autentica la confezione", () => {
  const ai = riconoscimento();
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), ai);
  const verifica = verificaProduttore({
    riconoscimento: ai,
    etichetta,
    ocr: ocr(),
    web: null,
    prove: [],
    lettura: null,
    discrepanze,
  });

  const denominazione = verifica.controlli.find((voce) => voce.id === "denominazione");
  assert.equal(denominazione.stato, "non_verificabile");
  assert.equal(verifica.controlli.length, 10);
  assert.match(verifica.sintesi, /confezione/i);
});

test("produttore: una prova informativa non diventa ufficiale se marcata registrata", () => {
  const ai = riconoscimento();
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), ai);
  const informativa = {
    id: "ricerca:demo",
    tipo: "risultato_ricerca",
    denominazione: "Caciocavallo Silano",
    schemaQualita: "DOP",
    ente: "motore di ricerca",
    titolo: "Risultato trovato",
    url: "https://example.com/prodotto",
    riferimentoNormativo: null,
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: "Caciocavallo Silano DOP",
    consultataIl: "2026-11-20",
    relazione: "risultato ricerca",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: "Gruppo inventato",
    sedeGruppo: "Calabria",
  };
  const verifica = verificaProduttore({
    riconoscimento: ai,
    etichetta,
    ocr: ocr(),
    web: null,
    prove: [informativa],
    lettura: null,
    discrepanze,
  });

  assert.equal(
    verifica.controlli.find((voce) => voce.id === "denominazione").stato,
    "non_verificabile"
  );
  assert.equal(
    verifica.controlli.find((voce) => voce.id === "gruppo_riconosciuto").stato,
    "non_documentato"
  );
});

test("produttore: OCR concorde e assenza di discrepanze non equivalgono a verifica", () => {
  const ai = riconoscimento();
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), ai);
  const verifica = verificaProduttore({
    riconoscimento: ai,
    etichetta,
    ocr: ocr(),
    web: null,
    prove: [],
    lettura: null,
    discrepanze,
  });

  assert.equal(
    verifica.controlli.find((voce) => voce.id === "identita_prodotto").stato,
    "non_verificabile"
  );
  assert.equal(
    verifica.controlli.find((voce) => voce.id === "coerenza_etichetta_fonti").stato,
    "non_verificabile"
  );
  assert.equal(
    verifica.controlli.find((voce) => voce.id === "incongruenze").stato,
    "non_verificabile"
  );
});

test("produttore: la sede calabrese non dimostra l'origine del prodotto", () => {
  const ai = riconoscimento();
  const { etichetta, discrepanze } = estraiEtichetta(ocr(), ai);
  const web = {
    stato: "ok",
    consultataIl: "2026-11-20",
    query: ["caciocavallo silano"],
    fonti: [
      {
        id: "web:1",
        titolo: "ARSAC — Prodotti tradizionali calabresi",
        ente: "www.arsacweb.it",
        url: "https://www.arsacweb.it/prodotti",
        dominio: "www.arsacweb.it",
        natura: "regionale",
        attendibilita: "alta",
        consultataIl: "2026-11-20",
        dataDocumento: null,
        estratto: "Il Caciocavallo Silano è prodotto in Calabria, a Cosenza.",
        riferimentoNormativo: null,
        pagineLette: null,
        lettoIntegralmente: false,
        relazione: "ricerca web",
      },
    ],
    messaggio: null,
    durataMs: 120,
  };

  const verifica = verificaProduttore({
    riconoscimento: ai,
    etichetta,
    ocr: ocr(),
    web,
    prove: [],
    lettura: null,
    discrepanze,
  });

  assert.equal(
    verifica.controlli.find((voce) => voce.id === "legame_calabria").stato,
    "non_documentato"
  );
  assert.match(verifica.sintesi, /non dimostrano/i);
});

// ─── Pipeline completa ────────────────────────────────────────────────────

test("pipeline: OCR discordante dal modello non produce un verificato", async () => {
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera() {
      return {
        testo: JSON.stringify({
          prodotto: "Caciocavallo Silano",
          categoria: "Formaggi",
          denominazione_proposta: "Caciocavallo Silano DOP",
          territorio_proposto: "Calabria",
          schema_proposto: "DOP",
          produttore: "Caseificio Rossi S.p.A.",
          indicatore_etichetta: [],
          indicatore: [],
          indicatori_etichetta: ["DOP"],
          confidenza: 90,
          note: null,
          incongruenze_rilevate: [],
        }),
      };
    },
  };

  const risultato = await analizzaProdotto(
    {
      immagineBase64: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64"),
      mimeType: "image/jpeg",
    },
    {
      provider,
      registro: [],
      ocr: {
        async riconosci() {
          return {
            testo: "CACIOCAVALLO SILANO\nProdotto da: Caseificio San Lorenzo S.r.l.",
            confidenza: 80,
            parole: 12,
          };
        },
      },
      cercaBarcode: async () => null,
    }
  );

  assert.equal(risultato.esito.livello === "verificato", false);
  assert.equal(risultato.esito.ocr.stato, "ok");
  assert.ok(risultato.esito.discrepanze.length > 0);
  assert.equal(risultato.esito.produttore.controlli.length, 10);
  assert.ok(risultato.esito.tempi.totaleMs >= 0);
  assert.ok(risultato.meta.fasi);
});
