/**
 * RADICISCAN — TEST UNITARI DEL NUCLEO (FASE 2B)
 *
 * Nessuna chiamata AI reale, nessuna rete, nessun database: il provider è
 * sempre un finto iniettato, la RPC delle quote è una funzione locale.
 *
 * Comando:
 *   node --experimental-strip-types --import ./tests/support/hook-radiscan.mjs \
 *     --test tests/radiscan-core.spec.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const radiscan = await import("@/lib/radiscan");

const {
  analizzaOutputModello,
  analizzaProdotto,
  buildPromptRadiciScan,
  cacheValida,
  componiEsito,
  consumaQuota,
  creaChiaveCache,
  creaChiaveQuotaAnonima,
  creaChiaveQuotaAutenticata,
  creaProviderGemini,
  creaRigaCache,
  fonteDocumentata,
  interpretaRigaQuota,
  isUrlFonteUfficiale,
  limitiQuota,
  denominazioniEquivalenti,
  normalizzaDenominazione,
  normalizzaTesto,
  scadenzaCache,
  selezionaEsitoInCache,
  territoriCoerenti,
  variantiParola,
  creaRicercaEAmbrosia,
  estraiEtichetta,
  TTL_CACHE_GIORNI,
  TTL_CACHE_MS,
  validaChiaveQuota,
  VERSIONE_PROMPT,
  verificaDenominazione,
  LIMITI_QUOTA,
  AVVERTENZA_BASE,
  ETICHETTE_LIVELLO,
  LIVELLI,
} = radiscan;

const UUID_FONTE = "11111111-1111-4111-8111-111111111111";
const URL_MASAF =
  "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453";

function fonte(override = {}) {
  return {
    id: UUID_FONTE,
    slug: "demo-pecorino-crotonese",
    denominazione: "Pecorino Crotonese DOP",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Provincia di Crotone",
    ente: "MASAF",
    urlUfficiale: URL_MASAF,
    riferimentoNormativo: "Reg. (UE) 2024/1143, art. 22",
    consultataIl: "2026-11-18",
    attiva: true,
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
    riferimentoUrl:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    documentoUrl:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:JOL_2014_341_R_0001",
    estratto: "Scheda EUGI00000014301 · stato: registrata · tipo: PDO",
    consultataIl: "2026-11-19",
    relazione: "Corrispondenza esatta con la denominazione letta.",
    stato: "registrata",
    ...override,
  };
}

function riconoscimento(override = {}) {
  return {
    prodotto: "Formaggio pecorino",
    categoria: "Formaggi",
    denominazioneProposta: "Pecorino Crotonese DOP",
    territorioProposto: "Provincia di Crotone",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["Pecorino Crotonese", "DOP"],
    confidenza: 82,
    note: null,
    incongruenzeRilevate: [],
    ...override,
  };
}

// ─── Fonti e predicato di documentabilità ──────────────────────────────────

test("fonti: fonte documentata solo se denominazione attiva e completa", () => {
  assert.equal(fonteDocumentata(fonte()), true);
  assert.equal(fonteDocumentata(fonte({ tipoAtto: "registro" })), false);
  assert.equal(fonteDocumentata(fonte({ attiva: false })), false);
  assert.equal(fonteDocumentata(fonte({ territorio: "   " })), false);
  assert.equal(fonteDocumentata(fonte({ territorio: null })), false);
  assert.equal(fonteDocumentata(fonte({ schemaQualita: null })), false);
  assert.equal(fonteDocumentata(fonte({ riferimentoNormativo: "  " })), false);
  assert.equal(fonteDocumentata(fonte({ consultataIl: "" })), false);
  assert.equal(
    fonteDocumentata(fonte({ urlUfficiale: "http://www.masaf.gov.it/x" })),
    false
  );
  assert.equal(
    fonteDocumentata(fonte({ urlUfficiale: "https://evil.example/x" })),
    false
  );
  assert.equal(fonteDocumentata(null), false);
});

test("fonti: la whitelist resta quella dei quattro domini ufficiali", () => {
  assert.equal(isUrlFonteUfficiale(URL_MASAF), true);
  assert.equal(isUrlFonteUfficiale("https://ec.europa.eu/x"), true);
  assert.equal(isUrlFonteUfficiale("https://masaf.gov.it/x"), false);
  assert.equal(isUrlFonteUfficiale("https://www.masaf.gov.it.evil.example/x"), false);
  assert.equal(isUrlFonteUfficiale("http://www.masaf.gov.it/x"), false);
});

// ─── Normalizzazione e territori ───────────────────────────────────────────

test("normalizzazione: accenti, punteggiatura e etichette di qualità", () => {
  assert.equal(normalizzaTesto("  Caciocavallo  Silano D.O.P. "), "caciocavallo silano d o p");
  assert.equal(normalizzaDenominazione("Caciocavallo Silano D.O.P."), "caciocavallo silano");
  assert.equal(normalizzaDenominazione("Pecorino Crotonese DOP"), "pecorino crotonese");
  assert.equal(normalizzaDenominazione("Pecorino Crotonese"), "pecorino crotonese");
  assert.equal(normalizzaDenominazione("Bergamotto di Reggio Calabria"), "bergamotto di reggio calabria");
  assert.equal(normalizzaDenominazione("DOP"), "dop", "non svuota un nome composto solo dall'etichetta");

  assert.equal(territoriCoerenti("Calabria", "Regione Calabria"), true);
  assert.equal(territoriCoerenti("Provincia di Crotone", "provincia di crotone"), true);
  assert.equal(territoriCoerenti("Calabria", "Sicilia"), false);
  assert.equal(territoriCoerenti(null, "Sicilia"), true, "dato assente non è una contraddizione");
});

// ─── Schema dell'output del modello ────────────────────────────────────────

test("schema: accetta JSON valido anche in fence e normalizza i campi", () => {
  const esito = analizzaOutputModello(
    '```json\n{"prodotto":"  Pecorino  Crotonese  ","categoria":"Formaggi","denominazione_proposta":"Pecorino Crotonese DOP","schema_proposto":"dop","confidenza":101,"indicatori_etichetta":["DOP"]}\n```'
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.valore.riconoscimento.prodotto, "Pecorino Crotonese");
  assert.equal(esito.valore.riconoscimento.schemaProposto, "DOP");
  assert.equal(esito.valore.riconoscimento.confidenza, 100);
  assert.ok(esito.valore.avvisi.some((a) => a.includes("confidenza")));
});

test("schema: rifiuta output non JSON o senza prodotto", () => {
  assert.equal(analizzaOutputModello("").ok, false);
  assert.equal(analizzaOutputModello("non json").ok, false);
  assert.equal(analizzaOutputModello("[1,2,3]").ok, false);
  assert.equal(analizzaOutputModello('{"categoria":"Formaggi"}').ok, false);
  assert.equal(analizzaOutputModello('{"prodotto":"   "}').ok, false);
});

test("schema: ignora le fonti proposte e limita dimensioni e voci", () => {
  const payload = {
    prodotto: "Prodotto",
    fonti: [{ url: "https://evil.example" }],
    url: "https://evil.example",
    indicatori_etichetta: Array.from({ length: 20 }, (_, i) => `indicatore ${i}`),
    incongruenze_rilevate: ["possibile etichetta non coerente"],
    note: "x".repeat(500),
  };

  const esito = analizzaOutputModello(JSON.stringify(payload));
  assert.equal(esito.ok, true);
  assert.ok(
    esito.valore.avvisi.some((a) => a.includes("fonti proposte")),
    "le fonti del modello vanno segnalate come ignorate"
  );
  assert.equal(esito.valore.riconoscimento.indicatoriEtichetta.length, 8);
  assert.ok(esito.valore.riconoscimento.note.length <= 200);

  const schemaIgnoto = analizzaOutputModello('{"prodotto":"X","schema_proposto":"XYZ"}');
  assert.equal(schemaIgnoto.ok, true);
  assert.equal(schemaIgnoto.valore.riconoscimento.schemaProposto, null);
});

test("schema: accetta BIO e i campi dell'organismo di controllo", () => {
  const esito = analizzaOutputModello(
    JSON.stringify({
      prodotto: "Ricotta",
      schema_proposto: "bio",
      codice_organismo: "it bio 006",
      origine_materie_prime: "Agricoltura UE / non UE",
    })
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.valore.riconoscimento.schemaProposto, "BIO");
  assert.equal(esito.valore.riconoscimento.codiceOrganismo, "IT-BIO-006");
  assert.equal(
    esito.valore.riconoscimento.origineMateriePrime,
    "Agricoltura UE / non UE"
  );
});

test("schema: un codice organismo incompleto non viene completato", () => {
  const esito = analizzaOutputModello(
    '{"prodotto":"Ricotta","codice_organismo":"IT-BIO"}'
  );

  assert.equal(esito.ok, true);
  assert.equal(esito.valore.riconoscimento.codiceOrganismo, null);
  assert.ok(esito.valore.avvisi.some((avviso) => avviso.includes("codice_organismo")));
});

test("verifica: BIO resta non verificato e non interroga il registro", async () => {
  const riconoscimentoBio = {
    prodotto: "Ricotta",
    categoria: "Latticini",
    denominazioneProposta: "Ricotta",
    territorioProposto: null,
    schemaProposto: "BIO",
    indicatoriEtichetta: ["BIO"],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
    codiceOrganismo: "IT-BIO-006",
  };

  const esito = verificaDenominazione(riconoscimentoBio, []);
  assert.equal(esito.esito, "certificazione_biologica_da_etichetta");
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.fonte, null);
  assert.equal(esito.prove.length, 0);
  assert.match(esito.motivazione, /eAmbrosia/);
  assert.match(esito.motivazione, /IT-BIO-006/);

  let chiamate = 0;
  const provider = creaRicercaEAmbrosia({
    fetchImpl: async () => {
      chiamate += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    },
  });
  const ricerca = await provider.cerca({ riconoscimento: riconoscimentoBio });
  assert.equal(chiamate, 0, "BIO non deve produrre richieste a eAmbrosia");
  assert.equal(ricerca.stato, "non_eseguita");
  assert.equal(ricerca.fonte, null);
});

test("etichetta: legge Eurofoglia, codice IT-BIO e origine delle materie prime", () => {
  const testo = [
    "RICOTTA DI BUFALA",
    "Da agricoltura biologica",
    "IT-BIO-006",
    "Materie prime: Agricoltura UE / non UE",
    "Prodotto da: Caseificio San Lorenzo S.r.l.",
  ].join("\n");

  const { etichetta, discrepanze } = estraiEtichetta(
    {
      stato: "ok",
      testo,
      confidenza: 88,
      paroleLette: 12,
      caratteri: testo.length,
      lingue: ["ita"],
      durataMs: 400,
      motivo: null,
      avvisi: [],
    },
    {
      prodotto: "Ricotta di bufala",
      categoria: "Latticini",
      denominazioneProposta: "Ricotta di bufala",
      territorioProposto: null,
      schemaProposto: "BIO",
      indicatoriEtichetta: ["Eurofoglia"],
      confidenza: 80,
      note: null,
      incongruenzeRilevate: [],
      codiceOrganismo: "IT-BIO-006",
    }
  );

  assert.ok(etichetta.certificazioni.includes("BIO"));
  assert.equal(etichetta.codiceOrganismoBio.valore, "IT-BIO-006");
  assert.equal(etichetta.origineMateriePrimeBio.valore, "Agricoltura UE / non UE");
  assert.ok(!discrepanze.some((voce) => voce.campo === "codice_organismo"));
  assert.ok(!discrepanze.some((voce) => voce.campo === "schema_qualita"));
});

test("schema: rimuove i caratteri di controllo", () => {
  const esito = analizzaOutputModello(
    JSON.stringify({ prodotto: "Pecorino\u0000\u001f Crotonese" })
  );
  assert.equal(esito.ok, true);
  assert.equal(esito.valore.riconoscimento.prodotto, "Pecorino Crotonese");
});

test("schema: parser JSON autonomo, senza dipendenze Vision", () => {
  const fenceSenzaLinguaggio = analizzaOutputModello(
    '```\n{"prodotto":"Ricotta"}\n```'
  );
  assert.equal(fenceSenzaLinguaggio.ok, true);
  assert.equal(fenceSenzaLinguaggio.valore.riconoscimento.prodotto, "Ricotta");

  const conTestoAttorno = analizzaOutputModello(
    'Ecco il risultato: {"prodotto":"Pecorino"} — fine'
  );
  assert.equal(conTestoAttorno.ok, true);
  assert.equal(conTestoAttorno.valore.riconoscimento.prodotto, "Pecorino");

  for (const nonValido of ["", "non json", "{non json}", '{"prodotto":', "[1,2,3]", "null"]) {
    assert.equal(analizzaOutputModello(nonValido).ok, false, `testo: ${nonValido}`);
  }

  const incompleto = analizzaOutputModello('{"categoria":"Formaggi"}');
  assert.equal(incompleto.ok, false);
  assert.equal(incompleto.motivo, "campo prodotto assente o vuoto");
});

// ─── Verifica documentale ──────────────────────────────────────────────────

test("verifica: denominazione esatta su fonte completa => verificato", () => {
  const esito = verificaDenominazione(riconoscimento(), [fonte()]);

  assert.equal(esito.esito, "confermata");
  assert.equal(esito.livello, "verificato");
  assert.equal(esito.fonte.id, UUID_FONTE);
  assert.equal(esito.denominazioneVerificata, "Pecorino Crotonese DOP");
  assert.match(esito.motivazione, /fonte ufficiale registrata/i);
});

test("verifica: fonte solo registro o disattivata non verifica", () => {
  const registro = verificaDenominazione(riconoscimento(), [
    fonte({ tipoAtto: "registro", schemaQualita: null, territorio: null }),
  ]);
  assert.equal(registro.livello, "non_verificato");
  assert.equal(registro.esito, "non_confermata");

  const disattivata = verificaDenominazione(riconoscimento(), [
    fonte({ attiva: false }),
  ]);
  assert.equal(disattivata.livello, "non_verificato");
  assert.equal(disattivata.esito, "fonte_non_verificabile");
  assert.equal(disattivata.denominazioneVerificata, null);
});

test("verifica: territorio o schema discordanti => possibile incongruenza", () => {
  const territorio = verificaDenominazione(
    riconoscimento({ territorioProposto: "Sicilia" }),
    [fonte()]
  );
  assert.equal(territorio.livello, "incongruenza_possibile");
  assert.equal(territorio.esito, "territorio_incoerente");
  assert.match(territorio.motivazione, /possibile incongruenza/i);
  assert.doesNotMatch(territorio.motivazione, /frode|contraffazione certa|truffa/i);

  const schema = verificaDenominazione(
    riconoscimento({ schemaProposto: "IGP" }),
    [fonte()]
  );
  assert.equal(schema.livello, "incongruenza_possibile");
  assert.equal(schema.esito, "schema_incoerente");
});

test("verifica: denominazione assente o non in registro => mai verificato", () => {
  const senzaDenominazione = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: null,
      schemaProposto: null,
      territorioProposto: null,
    }),
    [fonte()]
  );
  assert.equal(senzaDenominazione.livello, "non_verificato");
  assert.equal(senzaDenominazione.esito, "nessuna_denominazione");

  const ignota = verificaDenominazione(
    riconoscimento({ denominazioneProposta: "Pecorino di Atlantide DOP" }),
    [fonte()]
  );
  assert.notEqual(ignota.livello, "verificato");
  assert.equal(ignota.esito, "non_confermata");
});

test("verifica: coerenza senza denominazione resta non verificata", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: null,
      schemaProposto: "DOP",
      territorioProposto: "Provincia di Crotone",
    }),
    [fonte()]
  );
  assert.equal(esito.esito, "coerente_senza_denominazione");
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.denominazioneVerificata, null);
});

test("verifica: registro vuoto non produce mai verificato", () => {
  const esito = verificaDenominazione(riconoscimento(), []);
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
});

test("verifica: prova eAmbrosia esatta senza fonte curata => riscontro parziale", () => {
  const ricerca = {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-19",
    query: ["pecorino crotonese"],
    prove: [prova()],
    messaggio: null,
  };

  const esito = verificaDenominazione(riconoscimento(), [], ricerca);
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.denominazioneVerificata, null);
  assert.equal(esito.prove.length, 1);
  assert.equal(esito.prove[0].tipo, "ufficiale");
  assert.equal(esito.ricerca.stato, "ok");
  assert.match(esito.motivazione, /registro ufficiale eAmbrosia/i);
});

test("verifica: errore di ricerca non equivale ad assenza di prove", () => {
  const ricerca = {
    stato: "non_disponibile",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-19",
    query: ["pecorino crotonese"],
    prove: [],
    messaggio:
      "La ricerca nel registro eAmbrosia non è stata completata. L'esito non dimostra l'assenza di fonti.",
  };

  const esito = verificaDenominazione(riconoscimento(), [], ricerca);
  assert.equal(esito.esito, "ricerca_non_disponibile");
  assert.equal(esito.livello, "non_verificato");
  assert.match(esito.motivazione, /non dimostra l'assenza/i);
  assert.equal(esito.ricerca.stato, "non_disponibile");
});

test("verifica: varianti morfologiche controllate, non somiglianza fuzzy", () => {
  assert.equal(denominazioniEquivalenti("Peperone di Senise", "Peperoni di Senise"), true);
  assert.equal(denominazioniEquivalenti("Fico di Cosenza", "Fichi di Cosenza"), true);
  assert.equal(denominazioniEquivalenti("Pecorino Crotonese", "Pecorino Romano"), false);
  assert.ok(variantiParola("peperone").includes("peperoni"));
  assert.ok(variantiParola("fichi").includes("fico"));
});

// ─── Livelli e composizione dell'esito ─────────────────────────────────────

test("livelli: verificato implica fonte UUID e snapshot", () => {
  const verifica = verificaDenominazione(riconoscimento(), [fonte()]);
  const esito = componiEsito({
    riconoscimento: riconoscimento(),
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  assert.equal(esito.livello, "verificato");
  assert.equal(esito.fonteId, UUID_FONTE);
  assert.equal(esito.denominazioneVerificata, "Pecorino Crotonese DOP");
  assert.equal(esito.versionePrompt, VERSIONE_PROMPT);
  assert.equal(esito.avvertenza, AVVERTENZA_BASE);
  assert.match(esito.avvertenza, /non certifica l'autenticità/i);
});

test("livelli: una possibile incongruenza del modello abbassa il livello", () => {
  const verifica = verificaDenominazione(riconoscimento(), [fonte()]);
  const esito = componiEsito({
    riconoscimento: riconoscimento({ incongruenzeRilevate: ["possibile etichetta scolorita"] }),
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  assert.equal(esito.livello, "incongruenza_possibile");
  assert.equal(esito.denominazioneVerificata, null, "nessuno snapshot senza verificato");
  assert.equal(esito.fonteId, UUID_FONTE, "la fonte resta come contesto");
  assert.match(esito.verifica.motivazione, /possibile/i);
});

test("livelli: nessuna etichetta presenta il prodotto come autentico", () => {
  for (const livello of LIVELLI) {
    assert.doesNotMatch(ETICHETTE_LIVELLO[livello], /autentico|autentica|certificato/i);
  }
  assert.doesNotMatch(AVVERTENZA_BASE, /prodotto autentico|certificazione rilasciata/i);
});

// ─── Cache ─────────────────────────────────────────────────────────────────

test("cache: TTL di 30 giorni e chiave con versione del prompt", () => {
  const adesso = new Date("2026-11-18T10:00:00.000Z");
  assert.equal(TTL_CACHE_GIORNI, 30);
  assert.equal(TTL_CACHE_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(
    scadenzaCache(adesso),
    new Date("2026-12-18T10:00:00.000Z").toISOString()
  );

  const chiave = creaChiaveCache("0123456789abcdef");
  assert.equal(chiave.versionePrompt, VERSIONE_PROMPT);
  assert.throws(() => creaChiaveCache("abc"));
  assert.throws(() => creaChiaveCache("0123456789ABCDEF"));
});

test("cache: esiti scaduti o di prompt precedenti non vengono riusati", () => {
  const adesso = new Date("2026-11-18T10:00:00.000Z");
  const verifica = verificaDenominazione(riconoscimento(), [fonte()]);
  const esito = componiEsito({
    riconoscimento: riconoscimento(),
    verifica,
    versionePrompt: VERSIONE_PROMPT,
  });

  const chiave = creaChiaveCache("0123456789abcdef");
  const riga = creaRigaCache(chiave, esito, adesso);

  assert.equal(selezionaEsitoInCache([riga], chiave, adesso)?.livello, "verificato");
  assert.equal(cacheValida(riga, new Date("2026-12-18T09:59:59.000Z")), true);
  assert.equal(cacheValida(riga, new Date("2026-12-18T10:00:00.000Z")), false);
  assert.equal(
    selezionaEsitoInCache([riga], chiave, new Date("2026-12-19T00:00:00.000Z")),
    null
  );

  const altraVersione = creaChiaveCache("0123456789abcdef", "radiscan-0.9.0");
  assert.equal(selezionaEsitoInCache([riga], altraVersione, adesso), null);

  assert.ok(!("immagineBase64" in riga), "la cache non contiene immagini");
  assert.ok(!JSON.stringify(riga).includes("base64"), "nessun dato immagine nella riga");
});

// ─── Quote ─────────────────────────────────────────────────────────────────

test("quote: limiti non negoziabili 10/100 e 30/300", () => {
  assert.deepEqual(limitiQuota("anonimo"), { minuto: 10, giorno: 100 });
  assert.deepEqual(limitiQuota("autenticato"), { minuto: 30, giorno: 300 });
  assert.equal(LIMITI_QUOTA.anonimo.giorno, 100);
  assert.equal(LIMITI_QUOTA.autenticato.giorno, 300);
  assert.throws(() => limitiQuota("amministratore"));
});

test("quote: chiavi anonime e autenticate rispettano 16-128 caratteri", () => {
  const sale = "sale-di-test-lungo-16";
  const anonima = creaChiaveQuotaAnonima("203.0.113.7", sale);
  assert.match(anonima, /^anon:[0-9a-f]{64}$/);
  assert.equal(validaChiaveQuota(anonima), true);
  assert.equal(anonima, creaChiaveQuotaAnonima("203.0.113.7", sale));
  assert.notEqual(anonima, creaChiaveQuotaAnonima("203.0.113.8", sale));
  assert.notEqual(anonima, creaChiaveQuotaAnonima("203.0.113.7", `${sale}-altro`));
  assert.throws(() => creaChiaveQuotaAnonima("203.0.113.7", "corto"));
  assert.throws(() => creaChiaveQuotaAnonima("  ", sale));

  const autenticata = creaChiaveQuotaAutenticata(UUID_FONTE.toUpperCase());
  assert.equal(autenticata, `utente:${UUID_FONTE}`);
  assert.equal(validaChiaveQuota(autenticata), true);
  assert.throws(() => creaChiaveQuotaAutenticata("utente-1"));

  assert.equal(validaChiaveQuota("a".repeat(15)), false);
  assert.equal(validaChiaveQuota("a".repeat(16)), true);
  assert.equal(validaChiaveQuota("a".repeat(128)), true);
  assert.equal(validaChiaveQuota("a".repeat(129)), false);
});

test("quote: risposta RPC valida, negata e malformata", () => {
  const consentita = interpretaRigaQuota(
    [{ allowed: true, retry_after: 0, reason: null, usati_oggi: 9, limite_giorno: 100, limite_minuto: 10 }],
    "anonimo"
  );
  assert.equal(consentita.consentita, true);
  assert.equal(consentita.usatiOggi, 9);

  const negata = interpretaRigaQuota(
    [{ allowed: false, retry_after: 42, reason: "Limite al minuto.", usati_oggi: 10, limite_giorno: 100, limite_minuto: 10 }],
    "anonimo"
  );
  assert.equal(negata.consentita, false);
  assert.equal(negata.riprovaTraSecondi, 42);

  const negataAutenticata = interpretaRigaQuota(
    [{ allowed: false, retry_after: 30, reason: "Limite al minuto.", usati_oggi: 30, limite_giorno: 300, limite_minuto: 30 }],
    "autenticato"
  );
  assert.equal(negataAutenticata.consentita, false);
  assert.equal(negataAutenticata.limiteMinuto, 30);
  assert.equal(negataAutenticata.limiteGiorno, 300);

  for (const malformata of [null, {}, [], [{ allowed: "si" }], [{ allowed: false }]]) {
    assert.throws(
      () => interpretaRigaQuota(malformata, "anonimo"),
      (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
    );
  }

  assert.throws(
    () =>
      interpretaRigaQuota(
        [{ allowed: true, usati_oggi: 0, limite_giorno: 300, limite_minuto: 30 }],
        "anonimo"
      ),
    (errore) => errore.codice === "RADICSCAN_QUOTA_CONFIGURAZIONE"
  );
});

test("quote: consumaQuota chiama la RPC 2A e fallisce chiuso", async () => {
  const chiamate = [];
  const rpcOk = async (nome, parametri) => {
    chiamate.push({ nome, parametri });
    return {
      data: [
        {
          allowed: true,
          retry_after: 0,
          reason: null,
          usati_oggi: 5,
          limite_giorno: 100,
          limite_minuto: 10,
        },
      ],
      error: null,
    };
  };

  const esito = await consumaQuota({
    rpc: rpcOk,
    chiave: creaChiaveQuotaAnonima("203.0.113.7", "sale-di-test-lungo-16"),
    modalita: "anonimo",
  });

  assert.equal(esito.consentita, true);
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].nome, "radiscan_consume_usage");
  assert.deepEqual(Object.keys(chiamate[0].parametri).sort(), [
    "p_chiave",
    "p_etichetta",
    "p_modalita",
  ]);
  assert.equal(chiamate[0].parametri.p_modalita, "anonimo");

  const rpcErrore = async () => ({ data: null, error: { message: "db giù" } });
  await assert.rejects(
    () =>
      consumaQuota({
        rpc: rpcErrore,
        chiave: creaChiaveQuotaAutenticata(UUID_FONTE),
        modalita: "autenticato",
      }),
    (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
  );

  const rpcEccezione = async () => {
    throw new Error("timeout");
  };
  await assert.rejects(
    () =>
      consumaQuota({
        rpc: rpcEccezione,
        chiave: creaChiaveQuotaAutenticata(UUID_FONTE),
        modalita: "autenticato",
      }),
    (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
  );

  const rpcVuota = async () => ({ data: [], error: null });
  await assert.rejects(
    () =>
      consumaQuota({
        rpc: rpcVuota,
        chiave: creaChiaveQuotaAutenticata(UUID_FONTE),
        modalita: "autenticato",
      }),
    (errore) => errore.codice === "RADICSCAN_QUOTA_NON_DISPONIBILE"
  );

  let rpcChiamata = false;
  await assert.rejects(
    () =>
      consumaQuota({
        rpc: async () => {
          rpcChiamata = true;
          return { data: null, error: null };
        },
        chiave: "corta",
        modalita: "anonimo",
      }),
    (errore) => errore.codice === "RADICSCAN_QUOTA_CONFIGURAZIONE"
  );
  assert.equal(rpcChiamata, false, "chiave non valida: nessuna chiamata alla RPC");
});

// ─── Provider Gemini ───────────────────────────────────────────────────────

test("gemini: chiave nell'header, mai nell'URL, e risposta estratta", async () => {
  const chiave = "chiave-di-test-non-reale";
  const richieste = [];
  const fetchImpl = async (url, init) => {
    richieste.push({ url, init });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"prodotto":"X"}' }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const provider = creaProviderGemini({
    apiKey: chiave,
    modello: "gemini-test",
    fetchImpl,
  });

  const esito = await provider.genera({
    prompt: buildPromptRadiciScan(),
    immagineBase64: "AAAA",
    mimeType: "image/jpeg",
  });

  assert.equal(esito.testo, '{"prodotto":"X"}');
  assert.equal(richieste.length, 1);
  assert.ok(!richieste[0].url.includes(chiave), "la chiave non deve stare nell'URL");
  assert.equal(richieste[0].init.headers["x-goog-api-key"], chiave);
  assert.match(richieste[0].url, /gemini-test:generateContent$/);

  const body = JSON.parse(richieste[0].init.body);
  assert.equal(body.contents[0].parts[1].inlineData.data, "AAAA");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});

test("gemini: errori mappati su codici stabili, senza segreti", async () => {
  const providerCon = (fetchImpl, timeoutMs = 1000) =>
    creaProviderGemini({ apiKey: "SEGRETO", modello: "m", fetchImpl, timeoutMs });

  await assert.rejects(
    () =>
      providerCon(async () => new Response("", { status: 429 })).genera({
        prompt: "p",
        immagineBase64: "AAAA",
        mimeType: "image/jpeg",
      }),
    (errore) => errore.codice === "RADICSCAN_PROVIDER_QUOTA"
  );

  await assert.rejects(
    () =>
      providerCon(async () => new Response("", { status: 500 })).genera({
        prompt: "p",
        immagineBase64: "AAAA",
        mimeType: "image/jpeg",
      }),
    (errore) => errore.codice === "RADICSCAN_PROVIDER_RISPOSTA"
  );

  await assert.rejects(
    () =>
      providerCon(async () => new Response("{}", { status: 200 })).genera({
        prompt: "p",
        immagineBase64: "AAAA",
        mimeType: "image/jpeg",
      }),
    (errore) => errore.codice === "RADICSCAN_PROVIDER_RISPOSTA"
  );

  const erroreRete = await providerCon(async () => {
    throw new Error("rete giù");
  })
    .genera({ prompt: "p", immagineBase64: "AAAA", mimeType: "image/jpeg" })
    .catch((errore) => errore);

  assert.equal(erroreRete.codice, "RADICSCAN_PROVIDER_RETE");
  assert.ok(!erroreRete.message.includes("SEGRETO"), "nessun segreto nei messaggi");
});

test("gemini: timeout e chiave assente", async () => {
  const fetchLento = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const errore = new Error("aborted");
        errore.name = "AbortError";
        reject(errore);
      });
    });

  await assert.rejects(
    () =>
      creaProviderGemini({
        apiKey: "k",
        modello: "m",
        timeoutMs: 10,
        fetchImpl: fetchLento,
      }).genera({ prompt: "p", immagineBase64: "AAAA", mimeType: "image/jpeg" }),
    (errore) => errore.codice === "RADICSCAN_PROVIDER_TIMEOUT"
  );

  const precedente = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.throws(
      () => creaProviderGemini({ modello: "m" }),
      (errore) => errore.codice === "RADICSCAN_PROVIDER_CONFIGURAZIONE"
    );
  } finally {
    if (precedente === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = precedente;
  }
});

// ─── Pipeline di analisi ───────────────────────────────────────────────────

test("analisi: pipeline completa con provider finto, nessuna immagine trattenuta", async () => {
  let promptRicevuto = "";
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera({ prompt }) {
      promptRicevuto = prompt;
      return {
        testo: JSON.stringify({
          prodotto: "Pecorino Crotonese",
          categoria: "Formaggi",
          denominazione_proposta: "Pecorino Crotonese DOP",
          territorio_proposto: "Provincia di Crotone",
          schema_proposto: "DOP",
          indicatori_etichetta: ["DOP", "Pecorino Crotonese"],
          confidenza: 78,
          note: null,
          incongruenze_rilevate: [],
        }),
      };
    },
  };

  const risultato = await analizzaProdotto(
    { immagineBase64: "QUJDRA==", mimeType: "image/jpeg", improntaImmagine: "0123456789abcdef" },
    { provider, registro: [fonte()] }
  );

  assert.equal(risultato.esito.livello, "verificato");
  assert.equal(risultato.esito.fonteId, UUID_FONTE);
  assert.equal(risultato.esito.denominazioneVerificata, "Pecorino Crotonese DOP");
  assert.equal(risultato.meta.provider, "finto");
  assert.equal(risultato.meta.modello, "finto-1");
  assert.ok(risultato.meta.durataMs >= 0);
  assert.equal(risultato.improntaImmagine, "0123456789abcdef");
  assert.equal(risultato.avvisiSchema.length, 0);

  assert.match(promptRicevuto, /RadiciScan/);
  assert.match(promptRicevuto, /non dichiarare mai/i);
  assert.ok(!promptRicevuto.includes("prezzo_suggerito"), "prompt non è quello venditori");

  assert.ok(!JSON.stringify(risultato).includes("QUJDRA=="), "l'immagine non è trattenuta");
});

test("analisi: output non valido non produce alcun esito", async () => {
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera() {
      return { testo: "non sono json" };
    },
  };

  await assert.rejects(
    () => analizzaProdotto({ immagineBase64: "AAAA", mimeType: "image/jpeg" }, { provider, registro: [] }),
    (errore) => errore.codice === "RADICSCAN_SCHEMA_NON_VALIDO"
  );
});

test("analisi: input immagine rifiutati prima del provider", async () => {
  let chiamato = false;
  const provider = {
    nome: "finto",
    modello: "finto-1",
    async genera() {
      chiamato = true;
      return { testo: "{}" };
    },
  };

  await assert.rejects(
    () => analizzaProdotto({ immagineBase64: "", mimeType: "image/jpeg" }, { provider, registro: [] }),
    (errore) => errore.codice === "RADICSCAN_INPUT_NON_VALIDO"
  );
  await assert.rejects(
    () =>
      analizzaProdotto(
        { immagineBase64: "data:image/jpeg;base64,AAAA", mimeType: "image/jpeg" },
        { provider, registro: [] }
      ),
    (errore) => errore.codice === "RADICSCAN_INPUT_NON_VALIDO"
  );
  await assert.rejects(
    () => analizzaProdotto({ immagineBase64: "AAAA", mimeType: "image/gif" }, { provider, registro: [] }),
    (errore) => errore.codice === "RADICSCAN_INPUT_NON_VALIDO"
  );
  await assert.rejects(
    () =>
      analizzaProdotto(
        { immagineBase64: "AAAA", mimeType: "image/jpeg", improntaImmagine: "zzz" },
        { provider, registro: [] }
      ),
    (errore) => errore.codice === "RADICSCAN_INPUT_NON_VALIDO"
  );

  assert.equal(chiamato, false, "nessuna chiamata al provider su input invalido");
});
