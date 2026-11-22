import test from "node:test";
import assert from "node:assert/strict";
await import("./support/hook-radiscan.mjs");

const { classificaTerritorioDichiarato, valutaProvenienza } = await import("../lib/radiscan/filiera.ts");
const { verificaDenominazione } = await import("../lib/radiscan/verifica.ts");
const { componiEsito } = await import("../lib/radiscan/livelli.ts");
const { decoRiconosciuta, decoRilevata, èCipollaBiancaCastrovillari } = await import("../components/radiscan/logica.ts");

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
