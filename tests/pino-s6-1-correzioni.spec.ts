import { expect, test } from "@playwright/test";

import { attributoCanonicoPino, estraiAttributiPino } from "../lib/assistente/understanding";
import { analizzaComprensionePino } from "../lib/assistente/semantica";
import {
  attributiProdottiPino,
  invocazioniConServizioPino,
  parametriFallbackPiano,
  rispostaServizioPino,
} from "../lib/assistente/index";
import {
  filtraNegoziPerServizioPino,
  negozioOffreServizioPino,
  rilevaRichiestaServizioPino,
  serviziCorrispondentiPino,
  serviziNonDichiaratiPino,
  validaToolParams,
} from "../lib/assistente/tools";

// ─── S6.1: correzioni funzionali prima della Preview ─────────────────────
//
// P1 — un colore o materiale negato non è un requisito positivo.
// P2 — più servizi richiesti insieme conservano ciascuno il proprio prezzo e
//      la propria durata.
// P3 — un servizio strutturato `attivo: false` non viene riattivato da un tag
//      legacy; i tag restano utilizzabili solo quando il record strutturato
//      manca, e non dimostrano prezzi o durate.
//
// Le fixture sono dati di test, non risultati del catalogo reale.

type RecordNegozio = Record<string, unknown>;

function negozioServizi(
  serviziStrutturati: Array<Record<string, unknown>> | null,
  tags: string[] = [],
  extra: Record<string, unknown> = {}
): RecordNegozio {
  return {
    id: "negozio-1",
    nome: "Attività test",
    descrizione: "Descrizione generica dell'attività",
    categoria: "Salute e benessere",
    servizi: tags,
    attivo: true,
    data: serviziStrutturati ? { servizi_strutturati: serviziStrutturati } : {},
    ...extra,
  };
}

type NegozioConServizi = {
  id: string;
  nome: string;
  serviziTrovati: Array<{ nome: string; prezzo: number | null; durataMin: number | null }>;
  serviziNonDichiarati?: string[];
};

function negozio(
  nome: string,
  serviziTrovati: NegozioConServizi["serviziTrovati"],
  serviziNonDichiarati?: string[]
): NegozioConServizi {
  return { id: `id-${nome}`, nome, serviziTrovati, serviziNonDichiarati };
}

const TAGLIO = { id: "s1", nome: "Taglio capelli", prezzo: 15, durata_min: 30, attivo: true };
const BARBA = { id: "s2", nome: "Barba", prezzo: 10, durata_min: 20, attivo: true };

// ─── P1 — attributi negati ───────────────────────────────────────────────

test.describe("S6.1/P1 — un attributo negato non diventa un requisito", () => {
  test("«Scarpe non nere»: nero escluso, nessun requisito positivo", () => {
    const frase = "Scarpe non nere";
    expect(estraiAttributiPino(frase).colori).toEqual([]);

    const u = analizzaComprensionePino(frase);
    expect(u.esclusioni).toContain("nere");
    expect(attributiProdottiPino(u, frase)).toBeNull();
  });

  test("«Scarpe nere non in tessuto»: nero positivo, tessuto escluso", () => {
    const frase = "Scarpe nere non in tessuto";
    const attributi = estraiAttributiPino(frase);
    expect(attributi.colori).toEqual(["nero"]);
    expect(attributi.materiali).toEqual([]);

    const u = analizzaComprensionePino(frase);
    expect(attributiProdottiPino(u, frase)).toEqual({ colori: ["nero"] });
  });

  test("«without leather»: pelle esclusa, non richiesta", () => {
    expect(estraiAttributiPino("Borsa without leather").materiali).toEqual([]);

    const frase = "Cerco una borsa without leather";
    const u = analizzaComprensionePino(frase);
    expect(u.esclusioni).toContain("leather");
    expect(attributiProdottiPino(u, frase)).toBeNull();
  });

  test("«not made of plastic»: plastica esclusa, non richiesta", () => {
    expect(estraiAttributiPino("Shoes not made of plastic").materiali).toEqual([]);

    const frase = "Cerco scarpe not made of plastic";
    const u = analizzaComprensionePino(frase);
    expect(u.esclusioni).toContain("plastic");
    expect(attributiProdottiPino(u, frase)).toBeNull();
  });

  test("«Borsa nera non di plastica»: nero positivo, plastica esclusa", () => {
    const frase = "Borsa nera non di plastica";
    expect(estraiAttributiPino(frase).colori).toEqual(["nero"]);
    expect(estraiAttributiPino(frase).materiali).toEqual([]);

    const u = analizzaComprensionePino(frase);
    expect(attributiProdottiPino(u, frase)).toEqual({ colori: ["nero"] });
  });

  test("«Scarpe non rosse ma nere»: nero positivo, rosso escluso", () => {
    const attributi = estraiAttributiPino("Scarpe non rosse ma nere");
    expect(attributi.colori).toEqual(["nero"]);
    expect(attributi.colori).not.toContain("rosso");
  });

  test("«non in pelle», «senza plastica», «not leather», «not black»", () => {
    expect(estraiAttributiPino("Borsa non in pelle").materiali).toEqual([]);
    expect(estraiAttributiPino("Borsa senza plastica").materiali).toEqual([]);
    expect(estraiAttributiPino("Shoes not leather").materiali).toEqual([]);
    expect(estraiAttributiPino("Shoes not black").colori).toEqual([]);
  });

  test("positivo seguito da negazione di un altro attributo e viceversa", () => {
    expect(estraiAttributiPino("borsa nera non in tessuto")).toMatchObject({
      colori: ["nero"],
      materiali: [],
    });
    expect(estraiAttributiPino("senza pelle, borsa rossa")).toMatchObject({
      colori: ["rosso"],
      materiali: [],
    });
  });

  test("«borsa nera non in tessuto» resta invariata (regressione S4.3/S4.6)", () => {
    const frase = "Cerco una borsa nera, non in tessuto";
    const u = analizzaComprensionePino(frase);
    expect(u.esclusioni).toEqual(["tessuto"]);
    expect(attributiProdottiPino(u, frase)).toEqual({ colori: ["nero"] });

    const vincoli = parametriFallbackPiano(undefined, u, frase);
    expect(vincoli.esclusioni).toEqual(["tessuto"]);
    expect(vincoli.colori).toEqual(["nero"]);
    expect(vincoli.materiali).toBeUndefined();
  });

  test("nessun attributo è insieme richiesto ed escluso", () => {
    const casi = [
      "Scarpe non nere",
      "Cerco una borsa without leather",
      "Cerco scarpe not made of plastic",
      "Cerco una borsa nera non di plastica",
    ];
    for (const frase of casi) {
      const u = analizzaComprensionePino(frase);
      const attributi = attributiProdottiPino(u, frase);
      const richiesti = [...(attributi?.colori ?? []), ...(attributi?.materiali ?? [])];
      const esclusi = new Set(
        u.esclusioni.map((voce) => attributoCanonicoPino(voce) ?? voce.toLowerCase())
      );
      for (const valore of richiesti) expect(esclusi.has(valore)).toBe(false);
    }
  });

  test("le esclusioni colore/materiale arrivano canoniche ai tool", () => {
    expect(attributoCanonicoPino("nere")).toBe("nero");
    expect(attributoCanonicoPino("leather")).toBe("pelle");
    expect(attributoCanonicoPino("glutine")).toBeNull();

    expect(
      validaToolParams("searchProducts", { esclusioni: ["nere"] }).params.esclusioni
    ).toEqual(["nero"]);
    expect(
      validaToolParams("searchProducts", { esclusioni: ["leather"] }).params.esclusioni
    ).toEqual(["pelle"]);
    expect(
      validaToolParams("searchProducts", { esclusioni: ["glutine"] }).params.esclusioni
    ).toEqual(["glutine"]);
  });
});

// ─── P2 — servizi multipli ───────────────────────────────────────────────

test.describe("S6.1/P2 — più servizi richiesti insieme", () => {
  test("«Cerco un barbiere per taglio e barba» riconosce entrambi", () => {
    expect(rilevaRichiestaServizioPino("Cerco un barbiere per taglio e barba")).toEqual({
      servizio: "taglio barba",
      attivita: "barbiere",
    });
  });

  test("due servizi strutturati distinti: entrambi con prezzo e durata propri", () => {
    const record = negozioServizi([TAGLIO, BARBA], [], { nome: "Barberia del centro" });

    expect(negozioOffreServizioPino(record, "taglio barba")).toBe(true);
    expect(serviziCorrispondentiPino(record, "taglio barba")).toEqual([
      { nome: "Taglio capelli", prezzo: 15, durataMin: 30 },
      { nome: "Barba", prezzo: 10, durataMin: 20 },
    ]);
    expect(serviziNonDichiaratiPino(record, "taglio barba")).toEqual([]);
  });

  test("un solo servizio disponibile: indicato l'altro come non dettagliato", () => {
    const record = negozioServizi([TAGLIO], ["taglio", "barba"]);

    expect(negozioOffreServizioPino(record, "taglio barba")).toBe(true);
    expect(serviziNonDichiaratiPino(record, "taglio barba")).toEqual(["barba"]);

    const risposta = rispostaServizioPino(
      [
        negozio(
          "Barberia",
          serviziCorrispondentiPino(record, "taglio barba"),
          serviziNonDichiaratiPino(record, "taglio barba")
        ),
      ],
      "taglio barba"
    );

    expect(risposta).toContain("Taglio capelli: €15 · circa 30 minuti");
    expect(risposta).toContain("barba: prezzo e durata non indicati");
    expect(risposta).not.toContain("€10");
  });

  test("prezzo mancante su un servizio: dichiarato solo per quello", () => {
    const record = negozioServizi([{ ...TAGLIO, prezzo: null }, BARBA]);

    expect(serviziCorrispondentiPino(record, "taglio barba")).toEqual([
      { nome: "Taglio capelli", prezzo: null, durataMin: 30 },
      { nome: "Barba", prezzo: 10, durataMin: 20 },
    ]);

    const risposta = rispostaServizioPino(
      [negozio("Barberia", serviziCorrispondentiPino(record, "taglio barba"))],
      "taglio barba"
    );

    expect(risposta).toContain("Taglio capelli: prezzo non indicato · circa 30 minuti");
    expect(risposta).toContain("Barba: €10 · circa 20 minuti");
  });

  test("la risposta distingue i servizi senza sommarli", () => {
    const record = negozioServizi([TAGLIO, BARBA]);

    const risposta = rispostaServizioPino(
      [negozio("Barberia", serviziCorrispondentiPino(record, "taglio barba"))],
      "taglio barba"
    );

    expect(risposta).toContain("Taglio capelli: €15 · circa 30 minuti");
    expect(risposta).toContain("Barba: €10 · circa 20 minuti");
    expect(risposta).not.toContain("€25");
    expect(risposta).toContain("dichiarano i servizi richiesti");
  });

  test("richiesta di un solo servizio: comportamento invariato", () => {
    const record = negozioServizi([TAGLIO, BARBA]);
    expect(serviziCorrispondentiPino(record, "taglio")).toEqual([
      { nome: "Taglio capelli", prezzo: 15, durataMin: 30 },
    ]);
    expect(serviziNonDichiaratiPino(record, "taglio")).toEqual([]);
  });

  test("nessuna invocazione aggiuntiva per i servizi multipli", () => {
    const invocazioni = invocazioniConServizioPino([], {
      servizio: "taglio barba",
      attivita: "barbiere",
    });

    expect(invocazioni).toHaveLength(1);
    expect(invocazioni[0].tool).toBe("searchStores");
    expect(invocazioni[0].params?.servizio).toBe("taglio barba");
  });
});

// ─── P3 — servizi esplicitamente disattivati ─────────────────────────────

test.describe("S6.1/P3 — lo stato strutturato prevale sui tag legacy", () => {
  test("`attivo: false` + tag legacy: il servizio resta escluso", () => {
    const record = negozioServizi([{ ...TAGLIO, attivo: false }], ["taglio"]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
    expect(filtraNegoziPerServizioPino([record], "taglio")).toEqual([]);
    expect(serviziCorrispondentiPino(record, "taglio")).toEqual([]);
  });

  test("`attivo: true` + tag: servizio disponibile con prezzo e durata", () => {
    const record = negozioServizi([TAGLIO], ["taglio"]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(true);
    expect(serviziCorrispondentiPino(record, "taglio")).toEqual([
      { nome: "Taglio capelli", prezzo: 15, durataMin: 30 },
    ]);
  });

  test("nessun record strutturato: il tag consente il match, senza prezzi", () => {
    const record = negozioServizi(null, ["taglio"]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(true);
    expect(serviziCorrispondentiPino(record, "taglio")).toEqual([]);
    expect(serviziNonDichiaratiPino(record, "taglio")).toEqual(["taglio"]);

    const risposta = rispostaServizioPino(
      [negozio("Parrucchieri Rossi", [], ["taglio"])],
      "taglio"
    );

    expect(risposta).toContain("offre taglio");
    expect(risposta).not.toContain("€");
    expect(risposta).not.toMatch(/minuti/);
  });

  test("tag legacy obsoleto senza record attivo: nessuna falsa riattivazione", () => {
    const record = negozioServizi([{ ...TAGLIO, attivo: false }], ["taglio", "capelli"]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
    expect(filtraNegoziPerServizioPino([record], "taglio")).toEqual([]);

    const risposta = rispostaServizioPino([], "taglio");
    expect(risposta).toContain("non ho trovato");
    expect(risposta).not.toContain("€");
  });
});
