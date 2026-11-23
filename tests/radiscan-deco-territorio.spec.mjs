import test from "node:test";
import assert from "node:assert/strict";
await import("./support/hook-radiscan.mjs");

const { classificaPerimetro, classificaTerritorioDichiarato, valutaProvenienza } =
  await import("../lib/radiscan/filiera.ts");
const { COMUNI_CALABRIA } = await import("../lib/radiscan/comuni-calabria.ts");
const { verificaDenominazione } = await import("../lib/radiscan/verifica.ts");
const { componiEsito } = await import("../lib/radiscan/livelli.ts");
const { decoRiconosciuta, decoRilevata, èCipollaBiancaCastrovillari, messaggioFuoriPerimetro } =
  await import("../components/radiscan/logica.ts");

test("DE.CO. è riconosciuta solo con riscontro ufficiale esatto", () => {
  assert.equal(decoRiconosciuta([{
    tipo: "ufficiale",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Corrispondenza esatta con la denominazione comunale",
  }]), true);
  assert.equal(decoRiconosciuta([{
    tipo: "informativa",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Corrispondenza esatta",
  }]), false);
  assert.equal(decoRiconosciuta([{
    tipo: "ufficiale",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Denominazione simile",
  }]), false);
});

test("la sigla DE.CO. viene rilevata ma non certificata automaticamente", () => {
  assert.equal(decoRilevata("DECO"), true);
  assert.equal(decoRilevata(null, ["Marchio DE.CO. presente"]), true);
  assert.equal(decoRilevata(null, [], ["DE CO"]), true);
  assert.equal(decoRilevata(null, ["prodotto tradizionale"]), false);
});

test("i 24 comuni lucani del Parco del Pollino sono ammessi", () => {
  const comuni = [
    "Calvera", "Carbone", "Castelluccio Inferiore", "Castelluccio Superiore",
    "Castelsaraceno", "Castronuovo Sant’Andrea", "Cersosimo", "Chiaromonte",
    "Episcopia", "Fardella", "Francavilla in Sinni", "Latronico", "Lauria",
    "Noepoli", "Rotonda", "San Costantino Albanese", "San Giorgio Lucano",
    "San Paolo Albanese", "San Severino Lucano", "Senise", "Teana",
    "Terranova di Pollino", "Valsinni", "Viggianello",
  ];
  for (const comune of comuni) {
    assert.equal(classificaTerritorioDichiarato(comune)?.tipo, "pollino_lucano", comune);
  }
  assert.equal(comuni.length, 24);
});

test("territori italiani fuori Calabria sono classificati come esterni", () => {
  for (const luogo of ["Basilicata", "Puglia", "Campania", "Toscana", "Lazio", "Sicilia"]) {
    assert.equal(classificaTerritorioDichiarato(luogo)?.tipo, "fuori_calabria", luogo);
  }
  assert.equal(classificaTerritorioDichiarato("Calabria"), null);
  assert.equal(classificaTerritorioDichiarato("Cosenza, Calabria"), null);
});

test("il riconoscimento Pollino non scatta per comuni lucani fuori elenco", () => {
  assert.equal(classificaTerritorioDichiarato("Matera")?.tipo, "fuori_calabria");
  assert.equal(classificaTerritorioDichiarato("Potenza")?.tipo, "fuori_calabria");
});

test("le province italiane esterne sono riconosciute anche senza il nome della regione", () => {
  for (const luogo of ["Parma", "Provincia di Parma", "Bologna", "Milano", "Roma", "Napoli", "Matera", "Potenza"]) {
    assert.equal(classificaTerritorioDichiarato(luogo)?.tipo, "fuori_calabria", luogo);
  }
  for (const luogo of ["Cosenza", "Crotone", "Catanzaro", "Vibo Valentia", "Reggio Calabria"]) {
    assert.equal(classificaTerritorioDichiarato(luogo), null, luogo);
  }
});


test("una DOP esatta e registrata può fornire il territorio dal nome ufficiale", () => {
  const riconoscimento = {
    prodotto: "Prosciutto di Parma",
    categoria: "salume",
    denominazioneProposta: "Prosciutto di Parma",
    territorioProposto: null,
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 95,
    note: null,
    incongruenzeRilevate: [],
  };
  const prova = {
    id: "eambrosia:parma",
    tipo: "ufficiale",
    denominazione: "Prosciutto di Parma",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "Prosciutto di Parma (DOP)",
    url: "https://example.test/parma",
    riferimentoNormativo: "Regolamento UE",
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: null,
    consultataIl: "2026-11-22",
    relazione: "Corrispondenza esatta",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
  };
  const esito = valutaProvenienza(riconoscimento, prova, null);
  assert.equal(esito.territorio.stato, "non_documentato");
  assert.match(esito.territorio.motivo, /denominazione ufficiale DOP/i);
  assert.match(esito.territorio.motivo, /Parma/i);
  assert.match(esito.territorio.motivo, /fuori dal perimetro territoriale ammesso/i);
  assert.doesNotMatch(esito.territorio.motivo, /autenticità|falso/i);
});

test("una denominazione affine o non registrata non viene usata per dedurre il territorio", () => {
  const riconoscimento = {
    prodotto: "Prosciutto tipo Parma",
    categoria: "salume",
    denominazioneProposta: "Prosciutto tipo Parma",
    territorioProposto: null,
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 80,
    note: null,
    incongruenzeRilevate: [],
  };
  const prova = {
    id: "eambrosia:parma-affine",
    tipo: "ufficiale",
    denominazione: "Prosciutto di Parma",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "Prosciutto di Parma (DOP)",
    url: "https://example.test/parma",
    riferimentoNormativo: null,
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: null,
    consultataIl: "2026-11-22",
    relazione: "Denominazione affine",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
  };
  const esito = valutaProvenienza(riconoscimento, prova, null);
  assert.equal(esito.territorio.stato, "non_documentato");
  assert.doesNotMatch(esito.territorio.motivo, /fuori dal perimetro/i);
});

test("il nome commerciale da solo non viene scambiato per territorio dichiarato", () => {
  const riconoscimento = {
    prodotto: "Prosciutto di Parma",
    categoria: "salume",
    denominazioneProposta: "Prosciutto di Parma",
    territorioProposto: null,
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 95,
    note: null,
    incongruenzeRilevate: [],
  };
  assert.equal(classificaTerritorioDichiarato(riconoscimento.territorioProposto), null);
  const provenienza = valutaProvenienza(riconoscimento, null, null);
  assert.equal(provenienza.territorio.stato, "non_verificabile");
  assert.doesNotMatch(provenienza.territorio.motivo, /fuori dalla Calabria|fuori calabria/i);
});



test("la Cipolla Bianca di Castrovillari resta DE.CO. e non viene promossa a DOP", () => {
  assert.equal(èCipollaBiancaCastrovillari("Cipolla Bianca di Castrovillari"), true);
  assert.equal(èCipollaBiancaCastrovillari("cipolla bianca Castrovillari - prodotto tipico"), true);
  assert.equal(èCipollaBiancaCastrovillari("Cipolla Bianca di Tropea"), false);
  assert.equal(èCipollaBiancaCastrovillari("Cipolla bianca"), false);
});


test("eAmbrosia: denominazione esatta e registrata confermata anche con PDF parziale", () => {
  const riconoscimento = {
    prodotto: "Pecorino Crotonese",
    categoria: "formaggio",
    denominazioneProposta: "Pecorino Crotonese",
    territorioProposto: "Crotone, Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 90,
    note: null,
    incongruenzeRilevate: [],
  };
  const prova = {
    id: "eambrosia:test-1",
    tipo: "ufficiale",
    denominazione: "Pecorino Crotonese",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "Pecorino Crotonese (DOP)",
    url: "https://example.test/eambrosia",
    riferimentoNormativo: "Regolamento UE di registrazione",
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: null,
    consultataIl: "2026-11-22",
    relazione: "Corrispondenza esatta con la denominazione letta",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
  };
  const ricerca = {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-22",
    query: ["pecorino crotonese"],
    prove: [prova],
    messaggio: null,
    lettura: {
      stato: "parziale",
      documenti: [],
      pagineLette: 1,
      pagineTotali: 8,
      consultataIl: "2026-11-22",
      messaggio: "1 pagina letta su 8; lettura incompleta.",
      notaPagine: null,
    },
  };

  // Senza fonte curata nel registro la denominazione non è verificata: il
  // riscontro resta parziale e non produce fonte né snapshot.
  const esito = verificaDenominazione(riconoscimento, [], ricerca);
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /registro ufficiale eAmbrosia/);
});

test("eAmbrosia esatta e registrata senza fonte curata non genera SCHEMA_NON_VALIDO", () => {
  const riconoscimento = {
    prodotto: "Pecorino Crotonese",
    categoria: "formaggio",
    denominazioneProposta: "Pecorino Crotonese",
    territorioProposto: "Crotone, Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 90,
    note: null,
    incongruenzeRilevate: [],
  };
  const prova = {
    id: "eambrosia:test-integrazione",
    tipo: "ufficiale",
    denominazione: "Pecorino Crotonese",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "Pecorino Crotonese (DOP)",
    url: "https://example.test/eambrosia",
    riferimentoNormativo: "Regolamento UE di registrazione",
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: null,
    consultataIl: "2026-11-22",
    relazione: "Corrispondenza esatta con la denominazione letta",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
  };
  const ricerca = {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-22",
    query: ["pecorino crotonese"],
    prove: [prova],
    messaggio: null,
  };

  const verifica = verificaDenominazione(riconoscimento, [], ricerca);
  let esito;
  assert.doesNotThrow(() => {
    esito = componiEsito({ riconoscimento, verifica, versionePrompt: "test" });
  });
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.fonteId, null);
  assert.equal(esito.denominazioneVerificata, null);
});

test("eAmbrosia esatta e registrata con fonte curata resta verificata", () => {
  const riconoscimento = {
    prodotto: "Pecorino Crotonese",
    categoria: "formaggio",
    denominazioneProposta: "Pecorino Crotonese",
    territorioProposto: "Crotone, Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 90,
    note: null,
    incongruenzeRilevate: [],
  };
  const fonteCurata = {
    id: "11111111-2222-4333-8444-555555555555",
    slug: "test-pecorino-crotonese",
    denominazione: "Pecorino Crotonese",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Provincia di Crotone",
    ente: "MASAF",
    urlUfficiale: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
    riferimentoNormativo: "Reg. (UE) 2024/1143, art. 22",
    consultataIl: "2026-11-18",
    attiva: true,
  };

  const verifica = verificaDenominazione(riconoscimento, [fonteCurata]);
  const esito = componiEsito({ riconoscimento, verifica, versionePrompt: "test" });
  assert.equal(esito.livello, "verificato");
  assert.equal(esito.fonteId, fonteCurata.id);
  assert.equal(esito.denominazioneVerificata, "Pecorino Crotonese");
});

test("eAmbrosia non promuove denominazioni affini o non ancora registrate", () => {
  const base = {
    prodotto: "Pecorino Crotonese",
    categoria: "formaggio",
    denominazioneProposta: "Pecorino Crotonese",
    territorioProposto: null,
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 90,
    note: null,
    incongruenzeRilevate: [],
  };
  const makeProof = (overrides = {}) => ({
    id: "eambrosia:test-2",
    tipo: "ufficiale",
    denominazione: "Pecorino Crotonese",
    schemaQualita: "DOP",
    ente: "Commissione europea — eAmbrosia",
    titolo: "Pecorino Crotonese (DOP)",
    url: "https://example.test/eambrosia",
    riferimentoNormativo: null,
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: null,
    consultataIl: "2026-11-22",
    relazione: "Corrispondenza esatta",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: null,
    ...overrides,
  });
  const verify = (proof) => verificaDenominazione(base, [], {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-22",
    query: ["pecorino crotonese"],
    prove: [proof],
    messaggio: null,
    lettura: null,
  });

  assert.notEqual(verify(makeProof({ denominazione: "Pecorino di Crotone" })).livello, "verificato");
  assert.notEqual(verify(makeProof({ stato: "pubblicata" })).livello, "verificato");
  assert.notEqual(verify(makeProof({ stato: "in_domanda" })).livello, "verificato");
  assert.notEqual(verify(makeProof({ stato: "rimossa" })).livello, "verificato");
});

// ─── Perimetro territoriale: nessun prodotto esterno è ammissibile ─────────

function fonteTerritorio(override = {}) {
  return {
    id: "11111111-2222-4333-8444-555555555556",
    slug: "test-fonte-territorio",
    denominazione: "Pecorino Crotonese",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Provincia di Crotone",
    ente: "MASAF",
    urlUfficiale: "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
    riferimentoNormativo: "Reg. (UE) 2024/1143, art. 22",
    consultataIl: "2026-11-23",
    attiva: true,
    ...override,
  };
}

function riconoscimentoTerritorio(override = {}) {
  return {
    prodotto: "Pecorino Crotonese",
    categoria: "formaggio",
    denominazioneProposta: "Pecorino Crotonese",
    territorioProposto: "Crotone, Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 90,
    note: null,
    incongruenzeRilevate: [],
    ...override,
  };
}

test("DOP registrata in area esterna non viene restituita come verificata", () => {
  const riconoscimento = riconoscimentoTerritorio({
    prodotto: "Prosciutto di Parma",
    denominazioneProposta: "Prosciutto di Parma",
    territorioProposto: "Parma",
  });
  const fonte = fonteTerritorio({
    denominazione: "Prosciutto di Parma",
    territorio: "Provincia di Parma",
  });

  const verifica = verificaDenominazione(riconoscimento, [fonte]);
  assert.equal(verifica.esito, "fuori_perimetro");
  assert.notEqual(verifica.livello, "verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /perimetro ammesso da RadiciScan/i);
  assert.match(verifica.motivazione, /non è territorialmente ammissibile/i);

  const esito = componiEsito({ riconoscimento, verifica, versionePrompt: "test" });
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.denominazioneVerificata, null);
  assert.equal(esito.fonteId, fonte.id);
  assert.equal(esito.verifica.provenienza.territorio.stato, "non_documentato");
  assert.match(
    esito.verifica.provenienza.territorio.motivo,
    /fuori dal perimetro territoriale ammesso/i
  );
  assert.doesNotMatch(esito.verifica.motivazione, /falso|non autentico/i);
});

test("una fonte ufficiale esterna blocca il verificato anche senza territorio letto", () => {
  const riconoscimento = riconoscimentoTerritorio({
    prodotto: "Prosciutto di Parma",
    denominazioneProposta: "Prosciutto di Parma",
    territorioProposto: null,
  });
  const fonte = fonteTerritorio({
    denominazione: "Prosciutto di Parma",
    territorio: "Provincia di Parma",
  });

  const verifica = verificaDenominazione(riconoscimento, [fonte]);
  assert.equal(verifica.esito, "fuori_perimetro");
  assert.notEqual(verifica.livello, "verificato");
  assert.equal(verifica.fonte?.territorio, "Provincia di Parma");
});

test("un'etichetta esterna non resta verificata contro una denominazione calabrese", () => {
  const riconoscimento = riconoscimentoTerritorio({ territorioProposto: "Parma" });

  const verifica = verificaDenominazione(riconoscimento, [fonteTerritorio()]);
  assert.equal(verifica.esito, "fuori_perimetro");
  assert.notEqual(verifica.livello, "verificato");
  assert.match(verifica.motivazione, /L'etichetta dichiara un territorio esterno/i);
});

test("i comuni lucani fuori dal Pollino non sono ammissibili", () => {
  for (const luogo of ["Melfi (PZ)", "Policoro (MT)", "Potenza", "Basilicata"]) {
    const riconoscimento = riconoscimentoTerritorio({ territorioProposto: luogo });
    const verifica = verificaDenominazione(riconoscimento, [fonteTerritorio()]);
    assert.ok(
      ["fuori_perimetro", "territorio_incoerente"].includes(verifica.esito),
      `${luogo}: ${verifica.esito}`
    );
    assert.notEqual(verifica.livello, "verificato", luogo);
    assert.equal(verifica.denominazioneVerificata, null, luogo);
  }
});

test("un comune del Pollino lucano resta territorialmente ammissibile", () => {
  const riconoscimento = riconoscimentoTerritorio({ territorioProposto: "Rotonda" });

  const verifica = verificaDenominazione(riconoscimento, [
    fonteTerritorio({ territorio: "Rotonda" }),
  ]);
  assert.equal(verifica.esito, "confermata");
  assert.equal(verifica.livello, "verificato");
  assert.equal(verifica.provenienza.territorio.stato, "non_documentato");
  assert.match(verifica.provenienza.territorio.motivo, /versante lucano/i);
  assert.doesNotMatch(verifica.provenienza.territorio.motivo, /fuori dal perimetro/i);
});

// ─── Provenienza indeterminata: mai ammissibile ─────────────────────────────

test("classificazione del perimetro: solo Calabria e Pollino sono ammessi", () => {
  const casi = [
    ["Calabria", "ammesso"],
    ["Cosenza, Calabria", "ammesso"],
    ["Provincia di Crotone", "ammesso"],
    ["Reggio Calabria", "ammesso"],
    ["Rotonda", "ammesso"],
    ["Senise (PZ)", "ammesso"],
    ["Parma", "fuori_perimetro"],
    ["Policoro (MT)", "fuori_perimetro"],
    ["Basilicata", "fuori_perimetro"],
    ["Parma, Calabria", "fuori_perimetro"],
    ["Valle di Atlantide", "indeterminato"],
    ["Località Inesistente", "indeterminato"],
    [null, "indeterminato"],
    ["   ", "indeterminato"],
  ];

  for (const [testo, atteso] of casi) {
    assert.equal(classificaPerimetro(testo).stato, atteso, String(testo));
  }
});

// ─── Comuni calabresi indicati da soli ───────────────────────────────────────

test("i comuni calabresi sono ammessi anche senza provincia o regione", () => {
  const esempi = [
    "Castrovillari", "Cosenza", "Corigliano-Rossano", "Reggio Calabria",
    "Lamezia Terme", "Crotone", "Tropea", "Scalea",
  ];

  for (const comune of esempi) {
    const esito = classificaPerimetro(comune);
    assert.equal(esito.stato, "ammesso", comune);
    assert.equal(esito.area, "calabria", comune);
  }
});

test("sono riconosciuti comuni di tutte e cinque le province calabresi", () => {
  const perProvincia = {
    Cosenza: ["Acri", "Amantea", "Castrovillari", "Corigliano-Rossano", "Scalea"],
    Catanzaro: ["Lamezia Terme", "Soverato", "Catanzaro", "Sellia", "Tiriolo"],
    "Reggio Calabria": ["Reggio Calabria", "Locri", "Gioia Tauro", "Scilla", "Bova"],
    "Vibo Valentia": ["Tropea", "Mileto", "Vibo Valentia", "Pizzo", "Nicotera"],
    Crotone: ["Crotone", "Cirò", "Petilia Policastro", "Strongoli", "Umbriatico"],
  };

  for (const [provincia, comuni] of Object.entries(perProvincia)) {
    for (const comune of comuni) {
      assert.equal(
        classificaPerimetro(comune).stato,
        "ammesso",
        `${comune} (${provincia})`
      );
    }
  }
});

test("il nome del comune vale solo come parola intera: nessuna promozione per somiglianza", () => {
  // «Lagonegro» contiene «Lago» (comune CS) ma è in Basilicata, fuori Pollino.
  assert.equal(classificaPerimetro("Lagonegro").stato, "indeterminato");
  // «Cassano d'Adda» non è il comune calabrese «Cassano all'Ionio».
  assert.equal(classificaPerimetro("Cassano d'Adda").stato, "indeterminato");
  // «Scala» (SA) non è «Scalea» (CS).
  assert.equal(classificaPerimetro("Scala").stato, "indeterminato");
  // Un comune calabrese con omonima frazione di un altro comune resta ammesso
  // solo per il nome esatto.
  assert.equal(classificaPerimetro("Cassano all'Ionio").stato, "ammesso");
});

test("un'indicazione esterna vince anche se il testo cita un comune calabrese", () => {
  assert.equal(classificaPerimetro("Scalea, Salerno").stato, "fuori_perimetro");
  assert.equal(classificaPerimetro("Tropea (PZ)").stato, "fuori_perimetro");
  assert.equal(classificaPerimetro("Castrovillari, Basilicata").stato, "fuori_perimetro");
});

test("l'elenco calabrese coincide con il dataset ISTAT del repository", async () => {
  const { readFile } = await import("node:fs/promises");
  const dataset = JSON.parse(
    await readFile(new URL("../public/data/comuni.json", import.meta.url), "utf8")
  );
  const attesi = dataset
    .filter((comune) => comune.regione.nome === "Calabria")
    .map((comune) => comune.nome)
    .sort();

  assert.equal(attesi.length, 404);
  assert.deepEqual([...COMUNI_CALABRIA].sort(), attesi);
});

test("un'etichetta col solo comune calabrese resta verificata", () => {
  const verifica = verificaDenominazione(
    riconoscimentoTerritorio({ territorioProposto: "Castrovillari" }),
    [fonteTerritorio({ territorio: "Provincia di Cosenza" })]
  );

  assert.equal(verifica.esito, "confermata");
  assert.equal(verifica.livello, "verificato");
  assert.equal(verifica.denominazioneVerificata, "Pecorino Crotonese");
});

test("un comune lucano fuori Pollino resta non ammissibile anche da solo", () => {
  const verifica = verificaDenominazione(
    riconoscimentoTerritorio({ territorioProposto: "Lagonegro" }),
    [fonteTerritorio({ territorio: "Calabria" })]
  );

  assert.equal(verifica.esito, "territorio_indeterminato");
  assert.notEqual(verifica.livello, "verificato");
});

test("provenienza sconosciuta: denominazione valida, ma non ammissibile", () => {
  const riconoscimento = riconoscimentoTerritorio({
    territorioProposto: "Valle di Atlantide",
  });

  const verifica = verificaDenominazione(riconoscimento, [fonteTerritorio()]);
  assert.equal(verifica.esito, "territorio_indeterminato");
  assert.equal(verifica.livello, "coerente_non_verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /certificazione resta valida/i);
  assert.match(verifica.motivazione, /non è territorialmente ammissibile/i);
  assert.match(verifica.motivazione, /non è dichiarato falso o non autentico/i);
  assert.doesNotMatch(
    verifica.motivazione,
    /è falso|è contraffatto|prodotto non autentico/i
  );

  const esito = componiEsito({ riconoscimento, verifica, versionePrompt: "test" });
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.denominazioneVerificata, null);
});

test("provenienza ambigua: Calabria insieme a un'area esterna non ammette", () => {
  const verifica = verificaDenominazione(
    riconoscimentoTerritorio({ territorioProposto: "Parma, Crotone" }),
    [fonteTerritorio()]
  );

  assert.notEqual(verifica.livello, "verificato");
  assert.ok(
    ["fuori_perimetro", "territorio_incoerente", "territorio_indeterminato"].includes(
      verifica.esito
    ),
    verifica.esito
  );
});

test("etichetta senza provenienza e area della fonte non riconoscibile: non ammissibile", () => {
  const riconoscimento = riconoscimentoTerritorio({ territorioProposto: null });

  const verifica = verificaDenominazione(riconoscimento, [
    fonteTerritorio({ territorio: "Area non specificata" }),
  ]);
  assert.equal(verifica.esito, "territorio_indeterminato");
  assert.notEqual(verifica.livello, "verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /Area non specificata/);
  assert.match(verifica.motivazione, /perimetro ammesso da RadiciScan/i);
});

test("una provenienza Calabria resta ammessa", () => {
  const verifica = verificaDenominazione(
    riconoscimentoTerritorio({ territorioProposto: "Calabria" }),
    [fonteTerritorio()]
  );

  assert.equal(verifica.esito, "confermata");
  assert.equal(verifica.livello, "verificato");
  assert.equal(verifica.denominazioneVerificata, "Pecorino Crotonese");
});

test("DOP esterna: certificazione valida, ma fuori perimetro InCittà", () => {
  const verifica = verificaDenominazione(
    riconoscimentoTerritorio({
      prodotto: "Prosciutto di Parma",
      denominazioneProposta: "Prosciutto di Parma",
      territorioProposto: null,
    }),
    [
      fonteTerritorio({
        denominazione: "Prosciutto di Parma",
        territorio: "Provincia di Parma",
      }),
    ]
  );

  assert.equal(verifica.esito, "fuori_perimetro");
  assert.equal(verifica.livello, "coerente_non_verificato");
  assert.match(verifica.motivazione, /legittimità della certificazione/i);
  assert.match(verifica.motivazione, /non è territorialmente ammissibile/i);
});

const RICONOSCIMENTO_PARMA = {
  prodotto: "Prosciutto di Parma",
  categoria: "salume",
  denominazioneProposta: "Prosciutto di Parma",
  territorioProposto: "Parma",
  schemaProposto: "DOP",
  indicatoriEtichetta: ["DOP"],
  confidenza: 95,
  note: null,
  incongruenzeRilevate: [],
};

const PROVA_EAMBROSIA_PARMA = {
  id: "eambrosia:parma",
  tipo: "ufficiale",
  denominazione: "Prosciutto di Parma",
  schemaQualita: "DOP",
  ente: "Commissione europea — eAmbrosia",
  titolo: "Prosciutto di Parma (DOP)",
  url: "https://example.test/parma",
  riferimentoNormativo: "Regolamento UE",
  riferimentoUrl: null,
  documentoUrl: null,
  estratto: null,
  consultataIl: "2026-11-23",
  relazione: "Corrispondenza esatta",
  stato: "registrata",
  allegati: [],
  gruppoProduttori: null,
  sedeGruppo: null,
};

const RICERCA_EAMBROSIA_PARMA = {
  stato: "ok",
  fonte: "eAmbrosia",
  consultataIl: "2026-11-23",
  query: ["Prosciutto di Parma DOP"],
  prove: [PROVA_EAMBROSIA_PARMA],
  messaggio: null,
  lettura: null,
};

test("DOP esterna in eAmbrosia: riconosciuta, ma fuori perimetro anche senza fonte curata", () => {
  const verifica = verificaDenominazione(RICONOSCIMENTO_PARMA, [], RICERCA_EAMBROSIA_PARMA);

  assert.equal(verifica.esito, "fuori_perimetro");
  assert.equal(verifica.livello, "coerente_non_verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /Prosciutto di Parma/);
  assert.match(verifica.motivazione, /registrata nel registro ufficiale eAmbrosia/i);
  assert.match(verifica.motivazione, /non appartiene alla filiera calabro-lucana/i);
  assert.match(verifica.motivazione, /fuori dal perimetro territoriale ammesso da InCittà/i);
  assert.match(verifica.motivazione, /non è territorialmente ammissibile/i);
  assert.doesNotMatch(verifica.motivazione, /falso|non autentic/i);

  const esito = componiEsito({
    riconoscimento: RICONOSCIMENTO_PARMA,
    verifica,
    versionePrompt: "test",
  });
  assert.equal(esito.riconoscimento.prodotto, "Prosciutto di Parma");
  assert.equal(esito.verifica.esito, "fuori_perimetro");
  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.denominazioneVerificata, null);
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.verifica.provenienza.territorio.stato, "non_documentato");
  assert.match(esito.verifica.provenienza.territorio.motivo, /fuori dal perimetro/i);
});

test("denominazione con suffisso DOP senza territorio in etichetta resta fuori perimetro", () => {
  const verifica = verificaDenominazione(
    {
      ...RICONOSCIMENTO_PARMA,
      prodotto: "Prosciutto di Parma DOP",
      denominazioneProposta: "Prosciutto di Parma DOP",
      territorioProposto: null,
    },
    [],
    RICERCA_EAMBROSIA_PARMA
  );

  assert.equal(verifica.esito, "fuori_perimetro");
  assert.equal(verifica.livello, "coerente_non_verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /Prosciutto di Parma/);
  assert.match(verifica.motivazione, /non appartiene alla filiera calabro-lucana/i);
  assert.match(verifica.motivazione, /fuori dal perimetro territoriale ammesso da InCittà/i);
  assert.doesNotMatch(verifica.motivazione, /falso|non autentic/i);
});

test("nome prodotto esterno senza denominazione letta resta fuori perimetro", () => {
  const verifica = verificaDenominazione(
    {
      ...RICONOSCIMENTO_PARMA,
      prodotto: "PROSCIUTTO DI PARMA DOP",
      denominazioneProposta: null,
      territorioProposto: null,
    },
    [],
    RICERCA_EAMBROSIA_PARMA
  );

  assert.equal(verifica.esito, "fuori_perimetro");
  assert.equal(verifica.livello, "coerente_non_verificato");
  assert.equal(verifica.denominazioneVerificata, null);
  assert.match(verifica.motivazione, /riconosciuta e valida/i);
  assert.match(verifica.motivazione, /non appartiene alla filiera calabro-lucana/i);
  assert.match(verifica.motivazione, /fuori dal perimetro territoriale ammesso da InCittà/i);
  assert.doesNotMatch(verifica.motivazione, /falso|non autentic/i);
});

test("il messaggio finale dichiara DOP valida e non appartenenza alla filiera calabro-lucana", () => {
  const messaggio = messaggioFuoriPerimetro({
    prodotto: "Prosciutto di Parma",
    schemaProposto: "DOP",
  });

  assert.match(messaggio.descrizione, /Prodotto identificato: Prosciutto di Parma DOP/);
  assert.match(messaggio.descrizione, /denominazione DOP è riconosciuta e valida/i);
  assert.match(messaggio.descrizione, /non appartiene alla filiera calabro-lucana/i);
  assert.match(messaggio.descrizione, /fuori dal perimetro territoriale ammesso da InCittà/i);
  assert.doesNotMatch(messaggio.descrizione, /falso|non autentic/i);
});
