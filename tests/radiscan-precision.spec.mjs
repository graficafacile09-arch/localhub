/**
 * RADICISCAN — PRECISIONE DELLA VERIFICA DOP/IGP
 *
 * Regressione per la variabilità dovuta a `denominazioneProposta: null`.
 * Nessuna rete reale: le prove documentali e le fonti web sono costruite nel
 * test; il timeout usa un fetch iniettato che fallisce subito.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

const radiscan = await import("@/lib/radiscan");
const {
  confrontaTerritori,
  creaRicercaWeb,
  denominazioniEquivalenti,
  esisteCoerenzaSenzaDenominazione,
  prodottoSpecificoPerVerifica,
  sintetizzaFontiWeb,
  svuotaCacheWeb,
  territoriCoerenti,
  valutaProvenienza,
  verificaDenominazione,
} = radiscan;

beforeEach(() => svuotaCacheWeb());

function riconoscimento(override = {}) {
  return {
    prodotto: "Caciocavallo Silano",
    categoria: "Formaggi",
    denominazioneProposta: "Caciocavallo Silano DOP",
    territorioProposto: "Calabria",
    schemaProposto: "DOP",
    indicatoriEtichetta: ["DOP"],
    confidenza: 85,
    note: null,
    incongruenzeRilevate: [],
    produttore: null,
    ...override,
  };
}

function prova(override = {}) {
  return {
    id: "eambrosia:EUGI00000014301",
    tipo: "ufficiale",
    denominazione: "Caciocavallo Silano",
    schemaQualita: "DOP",
    ente: "Commissione europea — DG Agricoltura e sviluppo rurale (eAmbrosia)",
    titolo: "eAmbrosia — Caciocavallo Silano (PDO)",
    url: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/EUGI00000014301",
    riferimentoNormativo: "Reg. (UE) n. 1234/2020",
    riferimentoUrl: null,
    documentoUrl: null,
    estratto: "Scheda EUGI00000014301 · stato: registrata · tipo: PDO",
    consultataIl: "2026-11-21",
    relazione: "Denominazione affine restituita dal registro.",
    stato: "registrata",
    allegati: [],
    gruppoProduttori: null,
    sedeGruppo: "Cosenza, Calabria",
    ...override,
  };
}

function ricerca(prove = []) {
  return {
    stato: "ok",
    fonte: "eAmbrosia",
    consultataIl: "2026-11-21",
    query: [],
    prove,
    messaggio: null,
    lettura: null,
  };
}

function fonteCurata(override = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "caciocavallo-silano-dop",
    denominazione: "Caciocavallo Silano DOP",
    tipoAtto: "denominazione",
    schemaQualita: "DOP",
    territorio: "Calabria",
    ente: "MASAF",
    urlUfficiale:
      "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/15453",
    riferimentoNormativo: "Reg. (UE) n. 1234/2020",
    consultataIl: "2026-11-21",
    attiva: true,
    ...override,
  };
}

function fonteWeb(override = {}) {
  return {
    id: "web:1",
    titolo: "Caciocavallo Silano DOP — scheda prodotto",
    ente: "negozio-esempio.it",
    url: "https://negozio-esempio.it/caciocavallo-silano-dop",
    dominio: "negozio-esempio.it",
    natura: "commerciale",
    attendibilita: "bassa",
    consultataIl: "2026-11-21",
    dataDocumento: null,
    estratto:
      "Caciocavallo Silano DOP, formaggio a denominazione di origine protetta.",
    riferimentoNormativo: null,
    pagineLette: 1,
    lettoIntegralmente: true,
    metodoLettura: "http",
    relazione: "Pagina prodotto letta.",
    dichiarazione: "informativa",
    rilevanza: "alta",
    ...override,
  };
}

function verificaConTerritori(
  territorioProposto,
  territoriUfficiali,
  sedeGruppo = "Cosenza, Calabria"
) {
  const fonti = territoriUfficiali.map((territorio, indice) =>
    fonteCurata({
      id: `11111111-1111-4111-8111-${String(indice + 1).padStart(12, "0")}`,
      slug: `caciocavallo-silano-${indice + 1}`,
      territorio,
    })
  );

  return verificaDenominazione(
    riconoscimento({
      prodotto: "Caciocavallo Silano",
      denominazioneProposta: null,
      territorioProposto,
    }),
    fonti,
    ricerca([prova({ sedeGruppo })])
  );
}

test("PDO/DOP, PGI/IGP e TSG/STG sono equivalenti dopo la normalizzazione", () => {
  assert.equal(
    denominazioniEquivalenti(
      "Caciocavallo Silano PDO",
      "Caciocavallo Silano DOP"
    ),
    true
  );
  assert.equal(
    denominazioniEquivalenti("Pecorino Crotonese PGI", "Pecorino Crotonese IGP"),
    true
  );
  assert.equal(
    denominazioniEquivalenti("Prodotto TSG", "Prodotto STG"),
    true
  );
});

test("nomi generici non bastano, i nomi specifici restano validi", () => {
  for (const generico of [
    "Pecorino",
    "Salame",
    "Formaggio",
    "Salumi",
    "Salumi di Calabria",
  ]) {
    assert.equal(prodottoSpecificoPerVerifica(generico), false, generico);
  }

  for (const specifico of [
    "Caciocavallo Silano",
    "Pecorino Crotonese",
    "Soppressata di Calabria",
  ]) {
    assert.equal(prodottoSpecificoPerVerifica(specifico), true, specifico);
  }
});

test("denominazione presente e prova ufficiale esatta: riscontro prudente", () => {
  const esito = verificaDenominazione(
    riconoscimento(),
    [],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.equal(esito.prove.length, 1);
  assert.match(esito.motivazione, /registrata/i);
});

test("denominazione assente e nome prodotto specifico: usa la prova eAmbrosia", () => {
  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.equal(esito.prove.length, 1);
  assert.match(esito.motivazione, /nome prodotto "Caciocavallo Silano"/i);
  assert.match(esito.motivazione, /non una denominazione letta/i);
});

test("Pecorino Crotonese con sede a Crotone e territorio Calabria: non viene scartato", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      prodotto: "Pecorino Crotonese",
      denominazioneProposta: null,
      territorioProposto: "Calabria",
    }),
    [],
    ricerca([
      prova({
        denominazione: "Pecorino Crotonese",
        sedeGruppo: "Via XXV Aprile n. 62\n88900 - CROTONE",
      }),
    ])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("denominazione esatta e sede del gruppo assente: non viene scartata", () => {
  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [],
    ricerca([prova({ sedeGruppo: null })])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("sede del gruppo fuori area ma territorio ufficiale coerente: non viene scartata", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: null,
      territorioProposto: "Calabria",
    }),
    [fonteCurata()],
    ricerca([prova({ sedeGruppo: "Via del Corso 1 — Roma" })])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /territorio letto .* compatibile/i);
});

test("fonte ufficiale con territorio incompatibile: nessun riscontro positivo", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: null,
      territorioProposto: "Calabria",
    }),
    [fonteCurata({ territorio: "Lazio" })],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "incongruenza_possibile");
  assert.equal(esito.esito, "territorio_incoerente");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /contraddice il territorio della fonte curata/i);
});

test("fonte ufficiale senza territorio confrontabile: riscontro prudente non verificabile", () => {
  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [fonteCurata({ territorio: null })],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("territorio: i confini di parola evitano corrispondenze accidentali", () => {
  assert.equal(territoriCoerenti("Crotone", "Crotonese"), false);
  assert.equal(territoriCoerenti("Lazio", "Laziale"), false);
  assert.equal(territoriCoerenti("Veneto", "Venetissimo"), false);
  assert.equal(territoriCoerenti("Calabria", "Regione Calabria"), true);
  assert.equal(territoriCoerenti("Provincia di Crotone", "Crotone"), true);
});

test("territorio: Crotone / Crotonese non produce compatibilità", () => {
  const esito = verificaConTerritori("Crotone", ["Crotonese"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
  assert.doesNotMatch(esito.motivazione, /è compatibile/i);
});

test("territorio: Lazio / Laziale non produce compatibilità", () => {
  const esito = verificaConTerritori("Lazio", ["Laziale"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
  assert.doesNotMatch(esito.motivazione, /è compatibile/i);
});

test("territorio: Veneto / Venetissimo non produce compatibilità", () => {
  const esito = verificaConTerritori("Veneto", ["Venetissimo"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
  assert.doesNotMatch(esito.motivazione, /è compatibile/i);
});

test("territorio: Calabria / Provincia di Crotone è compatibile per gerarchia", () => {
  const esito = verificaConTerritori("Calabria", ["Provincia di Crotone"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /compatibile/i);
});

test("territorio: Calabria / Crotone è compatibile per gerarchia", () => {
  const esito = verificaConTerritori("Calabria", ["Crotone"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /compatibile/i);
});

test("territorio: Cosenza / Calabria è compatibile per gerarchia", () => {
  const esito = verificaConTerritori("Cosenza", ["Calabria"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /compatibile/i);
});

test("territorio: Provincia di Crotone / Crotone resta compatibile", () => {
  const esito = verificaConTerritori("Provincia di Crotone", ["Crotone"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /compatibile/i);
});

test("territorio: Calabria / Lazio è una contraddizione dimostrabile", () => {
  const esito = verificaConTerritori("Calabria", ["Lazio"]);

  assert.equal(esito.livello, "incongruenza_possibile");
  assert.equal(esito.esito, "territorio_incoerente");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /contraddice/i);
});

test("territorio: Cosenza / Provincia di Crotone è incoerente solo con la mappa", () => {
  const esito = verificaConTerritori("Cosenza", ["Provincia di Crotone"]);

  assert.equal(esito.livello, "incongruenza_possibile");
  assert.equal(esito.esito, "territorio_incoerente");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /contraddice/i);
});

test("territorio assente: resta non verificabile, non è una contraddizione", () => {
  const esito = verificaConTerritori(null, ["Calabria"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("territorio sconosciuto: non viene trasformato in contraddizione", () => {
  const esito = verificaConTerritori("Valle di Atlantide", ["Calabria"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("più fonti ufficiali concordanti: il risultato resta coerente", () => {
  const esito = verificaConTerritori("Calabria", [
    "Calabria",
    "Provincia di Crotone",
  ]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /compatibile/i);
});

test("più fonti ufficiali discordanti: il risultato non è una contraddizione", () => {
  const esito = verificaConTerritori("Calabria", ["Calabria", "Lazio"]);

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "riscontro_parziale");
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /area di produzione ufficiale non è disponibile o non è confrontabile/i
  );
});

test("sede del gruppo assente o fuori regione non incide sul controllo territoriale", () => {
  for (const sedeGruppo of [null, "Via del Corso 1 - Roma"]) {
    const esito = verificaConTerritori(
      "Calabria",
      ["Provincia di Crotone"],
      sedeGruppo
    );

    assert.equal(esito.livello, "coerente_non_verificato");
    assert.equal(esito.esito, "riscontro_parziale");
    assert.equal(esito.denominazioneVerificata, null);
    assert.match(esito.motivazione, /compatibile/i);
  }
});

test("denominazione verificata e territorio non comparabile: nome e territorio restano distinti", () => {
  const esito = verificaDenominazione(
    riconoscimento({ territorioProposto: "Valle di Atlantide" }),
    [fonteCurata({ territorio: "Calabria" })],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "verificato");
  assert.equal(esito.esito, "confermata");
  assert.equal(esito.denominazioneVerificata, "Caciocavallo Silano DOP");
  assert.match(
    esito.motivazione,
    /compatibilità territoriale non è stata verificata/i
  );
  assert.match(esito.motivazione, /verifica riguarda la denominazione/i);
  assert.match(
    esito.motivazione,
    /non è dichiarato falso o non autentico/i
  );
});

test("territorio mancante con denominazione verificata: nessuna compatibilità dichiarata", () => {
  const esito = verificaDenominazione(
    riconoscimento({ territorioProposto: null }),
    [fonteCurata()],
    ricerca([prova()])
  );

  assert.equal(esito.livello, "verificato");
  assert.equal(esito.denominazioneVerificata, "Caciocavallo Silano DOP");
  assert.match(esito.motivazione, /territorio non è indicato/i);
  assert.match(
    esito.motivazione,
    /compatibilità territoriale non è stata verificata/i
  );
});

test("nome generico di prodotto e territorio generico: nessun falso positivo", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      prodotto: "Pecorino",
      denominazioneProposta: null,
      territorioProposto: "Calabria",
      schemaProposto: "DOP",
    }),
    [],
    ricerca([prova({ denominazione: "Pecorino Crotonese" })])
  );

  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "nessuna_denominazione");
  assert.equal(esito.denominazioneVerificata, null);
});

test("denominazione assente e fonte commerciale pertinente: riscontro online, non certificazione", () => {
  const fonti = [fonteWeb()];
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({
      denominazioneProposta: null,
      produttore: null,
    }),
    fonti,
    []
  );

  assert.equal(sintesi.denominazione.stato, "menzionata");
  assert.match(sintesi.denominazione.testo, /nome prodotto specifico/i);
  assert.match(sintesi.denominazione.testo, /non è una certificazione ufficiale/i);
  assert.ok(sintesi.denominazione.fonti.includes(fonteWeb().url));
});

test("fonte istituzionale: resta distinta dalla registrazione ufficiale", () => {
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({
      denominazioneProposta: "Caciocavallo Silano DOP",
      produttore: null,
    }),
    [
      fonteWeb({
        id: "web:istituzionale",
        titolo: "MASAF — Caciocavallo Silano DOP",
        ente: "www.masaf.gov.it",
        url: "https://www.masaf.gov.it/caciocavallo-silano-dop",
        dominio: "www.masaf.gov.it",
        natura: "ufficiale_it",
        attendibilita: "alta",
        dichiarazione: "indipendente",
      }),
    ],
    []
  );

  assert.equal(sintesi.denominazione.stato, "menzionata");
  assert.match(sintesi.denominazione.testo, /riscontro online positivo/i);
});

test("nessuna fonte disponibile: assenza dichiarata, mai prova negativa", () => {
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({ denominazioneProposta: null, produttore: null }),
    [],
    []
  );
  assert.equal(sintesi.denominazione.stato, "non_confermata");
  assert.match(sintesi.denominazione.testo, /non dimostra/i);

  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [],
    ricerca([])
  );
  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "nessuna_denominazione");
  assert.equal(esito.denominazioneVerificata, null);
});

test("ordine delle fonti invertito: lo stato della denominazione non cambia", () => {
  const commerciale = fonteWeb();
  const istituzionale = fonteWeb({
    id: "web:2",
    titolo: "MASAF — Caciocavallo Silano DOP",
    ente: "www.masaf.gov.it",
    url: "https://www.masaf.gov.it/caciocavallo-silano-dop",
    dominio: "www.masaf.gov.it",
    natura: "ufficiale_it",
    attendibilita: "alta",
    dichiarazione: "indipendente",
  });
  const base = riconoscimento({ denominazioneProposta: null, produttore: null });

  const primo = sintetizzaFontiWeb(base, [commerciale, istituzionale], []);
  const inverso = sintetizzaFontiWeb(base, [istituzionale, commerciale], []);

  assert.equal(primo.denominazione.stato, inverso.denominazione.stato);
  assert.equal(primo.denominazione.testo, inverso.denominazione.testo);
});

test("timeout: non_disponibile non diventa una prova negativa", async () => {
  const web = await creaRicercaWeb({
    fetchImpl: async () => {
      throw new Error("rete assente");
    },
  }).cerca({ riconoscimento: riconoscimento({ denominazioneProposta: null }) });

  assert.equal(web.stato, "non_disponibile");
  assert.deepEqual(web.fonti, []);

  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [],
    {
      stato: "non_disponibile",
      fonte: "eAmbrosia",
      consultataIl: null,
      query: [],
      prove: [],
      messaggio: "La ricerca non è stata completata: non dimostra l'assenza di fonti.",
      lettura: null,
    }
  );

  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "ricerca_non_disponibile");
  assert.equal(esito.denominazioneVerificata, null);
});

test("pagina generica prodotto + territorio: non diventa fonte pertinente", async () => {
  const risultati = `<html><body><a class="result__a" href="/l/?uddg=${encodeURIComponent(
    "https://www.esempio.it/prodotti"
  )}">Caciocavallo artigianale di un comune calabrese</a><div class="result__snippet">Prodotti tipici locali della Calabria.</div></body></html>`;

  const esito = await creaRicercaWeb({
    leggiPagineUfficiali: false,
    fetchImpl: async (url) => {
      const testoUrl = String(url);
      if (testoUrl.includes("html.duckduckgo.com")) {
        return new Response(risultati, {
          status: 200,
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
      return new Response("", { status: 404 });
    },
  }).cerca({
    riconoscimento: riconoscimento({
      prodotto: "Caciocavallo Silano",
      denominazioneProposta: null,
      produttore: null,
    }),
  });

  assert.equal(esito.stato, "ok");
  assert.deepEqual(esito.fonti, []);
});

test("senza prova adeguata non viene dichiarata una certificazione ufficiale", () => {
  const sintesi = sintetizzaFontiWeb(
    riconoscimento({ denominazioneProposta: null, produttore: null }),
    [fonteWeb()],
    []
  );
  assert.notEqual(sintesi.denominazione.stato, "registrata");

  const esito = verificaDenominazione(
    riconoscimento({ denominazioneProposta: null }),
    [],
    ricerca([])
  );
  assert.notEqual(esito.livello, "verificato");
  assert.equal(esito.denominazioneVerificata, null);
});

test("territorio: confrontaTerritori non dichiara mai coerenti input nulli o vuoti", () => {
  assert.equal(confrontaTerritori(null, "Calabria"), "non_comparabile");
  assert.equal(confrontaTerritori("Calabria", null), "non_comparabile");
  assert.equal(confrontaTerritori("", "Calabria"), "non_comparabile");
  assert.equal(confrontaTerritori("   ", "  "), "non_comparabile");

  assert.equal(confrontaTerritori("Calabria", "Regione Calabria"), "coerente");
  assert.equal(confrontaTerritori("Crotone", "Crotonese"), "non_comparabile");
});

test("territorio letto assente: nessuna compatibilità dichiarata con schema compatibile", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: "Denominazione Non Presente DOP",
      territorioProposto: null,
    }),
    [fonteCurata()],
    { ...ricerca([]), stato: "non_eseguita", consultataIl: null }
  );

  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "non_confermata");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(
    esito.motivazione,
    /territorio non è indicato|non è confrontabile/i
  );
  assert.match(
    esito.motivazione,
    /compatibilità territoriale non è stata verificata/i
  );
  assert.doesNotMatch(esito.motivazione, /territorio sono compatibili/i);
});

test("schema compatibile e territorio sconosciuto: riscontro prudente, mai verifica territoriale", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: "Denominazione Non Presente DOP",
      territorioProposto: "Valle di Atlantide",
    }),
    [fonteCurata()],
    { ...ricerca([]), stato: "non_eseguita", consultataIl: null }
  );

  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "non_confermata");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /non è confrontabile/i);
  assert.match(
    esito.motivazione,
    /compatibilità territoriale non è stata verificata/i
  );
});

test("denominazione diversa dal registro: non viene mostrata come denominazione del prodotto", () => {
  const esito = verificaDenominazione(
    riconoscimento({
      prodotto: "Pecorino Romano",
      denominazioneProposta: "Pecorino Romano DOP",
      territorioProposto: "Calabria",
    }),
    [fonteCurata()],
    { ...ricerca([]), stato: "non_eseguita", consultataIl: null }
  );

  assert.equal(esito.livello, "coerente_non_verificato");
  assert.equal(esito.esito, "non_confermata");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /per altre denominazioni/i);
  assert.doesNotMatch(esito.motivazione, /Caciocavallo Silano/);
});

test("sede amministrativa del gruppo: informazione separata, non prova della zona di produzione", () => {
  const esito = valutaProvenienza(
    riconoscimento({ denominazioneProposta: "Caciocavallo Silano DOP" }),
    prova({ sedeGruppo: "Cosenza, Calabria" }),
    null
  );

  assert.equal(esito.territorio.stato, "non_documentato");
  assert.equal(esito.territorio.evidenze.length, 1);
  assert.match(esito.territorio.evidenze[0].fonte, /sede amministrativa/i);
  assert.match(esito.territorio.evidenze[0].fonte, /non area di produzione/i);
  assert.match(
    esito.territorio.motivo,
    /sede amministrativa del gruppo non è l'area di produzione/i
  );
  assert.doesNotMatch(esito.territorio.motivo, /Riguarda la zona di produzione/i);
});

test("sede del gruppo fuori regione: resta informazione amministrativa, non prova territoriale", () => {
  const esito = valutaProvenienza(
    riconoscimento({ denominazioneProposta: "Caciocavallo Silano DOP" }),
    prova({ sedeGruppo: "Via del Corso 1 — Roma" }),
    null
  );

  assert.equal(esito.territorio.stato, "non_documentato");
  assert.match(esito.territorio.evidenze[0].estratto, /Roma/);
  assert.match(esito.territorio.motivo, /non è l'area di produzione/i);
});

test("coerenza senza denominazione: schema null e territorio Calabria non producono coerenza congiunta", () => {
  assert.deepEqual(
    esisteCoerenzaSenzaDenominazione([fonteCurata()], null, "Calabria"),
    { stato: "non_verificabile", motivo: "schema_mancante" }
  );

  const esito = verificaDenominazione(
    riconoscimento({
      denominazioneProposta: "Denominazione Non Presente",
      schemaProposto: null,
      territorioProposto: "Calabria",
    }),
    [fonteCurata()],
    { ...ricerca([]), stato: "non_eseguita", consultataIl: null }
  );

  assert.equal(esito.livello, "non_verificato");
  assert.equal(esito.esito, "non_confermata");
  assert.equal(esito.fonte, null);
  assert.equal(esito.denominazioneVerificata, null);
  assert.match(esito.motivazione, /schema non è indicato/i);
  assert.match(esito.motivazione, /compatibilità congiunta/i);
  assert.doesNotMatch(
    esito.motivazione,
    /schema e territorio sono compatibili/i
  );
});

test("coerenza senza denominazione: schema e territorio assenti restano assenti", () => {
  assert.deepEqual(
    esisteCoerenzaSenzaDenominazione([fonteCurata()], null, null),
    { stato: "assente" }
  );
});

test("coerenza senza denominazione: schema presente e territorio assente => non_verificabile", () => {
  assert.deepEqual(
    esisteCoerenzaSenzaDenominazione([fonteCurata()], "DOP", null),
    { stato: "non_verificabile", motivo: "territorio_mancante" }
  );
});

test("coerenza senza denominazione: schema e territorio presenti e compatibili restano coerenti", () => {
  assert.deepEqual(
    esisteCoerenzaSenzaDenominazione([fonteCurata()], "DOP", "Calabria"),
    { stato: "coerente" }
  );
  assert.deepEqual(
    esisteCoerenzaSenzaDenominazione([fonteCurata()], "DOP", "Crotone"),
    { stato: "coerente" }
  );
});

test("filiera: documentato solo dai documenti, sede amministrativa resta distinta", () => {
  const lettura = {
    stato: "completa",
    documenti: [
      {
        id: "doc-1",
        titolo: "Disciplinare Caciocavallo Silano",
        url: "https://ec.europa.eu/disciplinare.pdf",
        tipo: "disciplinare",
        stato: "letto",
        associazionePagine: "pagine",
        pagineTotali: 1,
        pagineLette: 1,
        pagineNonLette: 0,
        motivo: null,
        sezioni: [{ pagina: 1, testo: "Zona di produzione: Calabria." }],
        troncato: false,
      },
    ],
    pagineLette: 1,
    pagineTotali: 1,
    consultataIl: "2026-11-21",
    messaggio: "1 pagina letta in 1 documento.",
    notaPagine: null,
  };

  const esito = valutaProvenienza(
    riconoscimento({ denominazioneProposta: "Caciocavallo Silano DOP" }),
    prova({ sedeGruppo: "Via del Corso 1 — Roma" }),
    lettura
  );

  assert.equal(esito.territorio.stato, "documentato");
  assert.equal(esito.territorio.evidenze.length, 2);
  assert.match(esito.territorio.evidenze[0].fonte, /sede amministrativa/i);
  assert.match(esito.territorio.evidenze[0].fonte, /non area di produzione/i);
  assert.match(
    esito.territorio.evidenze[1].fonte,
    /Disciplinare Caciocavallo Silano/
  );
  assert.match(esito.territorio.motivo, /documento ufficiale letto/i);
  assert.doesNotMatch(esito.territorio.motivo, /Riguarda la zona di produzione/i);
});
