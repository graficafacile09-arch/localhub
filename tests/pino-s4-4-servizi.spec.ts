import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  filtraNegoziPerServizioPino,
  negozioOffreServizioPino,
  serviziAttiviPino,
  serviziCorrispondentiPino,
  validaToolParams,
} from "../lib/assistente/tools";

// ─── S4.4: servizi delle attività (D-2, alternativa A) ───────────────────
//
// `searchStores` accetta un parametro facoltativo `servizio`: il filtro lavora
// sui dati grezzi della RPC (`negozi.data.servizi_strutturati` e tag
// `negozi.servizi`) prima del mapping finale. Un servizio assente o inattivo
// non ripiega sulla ricerca generica: la risposta resta vuota.
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

const TAGLIO = { id: "s1", nome: "Taglio capelli", prezzo: 18, durata_min: 30, attivo: true };

test.describe("S4.4 — servizi strutturati", () => {
  test("barbiere con servizio taglio: riconosciuto, con prezzo e durata reali", () => {
    const record = negozioServizi([TAGLIO], [], { nome: "Barberia del centro" });

    expect(negozioOffreServizioPino(record, "taglio")).toBe(true);
    expect(negozioOffreServizioPino(record, "taglio capelli")).toBe(true);
    expect(serviziCorrispondentiPino(record, "taglio")).toEqual([
      { nome: "Taglio capelli", prezzo: 18, durataMin: 30 },
    ]);
  });

  test("servizio strutturato attivo: incluso anche con `attivo` assente", () => {
    const record = negozioServizi([{ nome: "Visita cardiologica", prezzo: 90 }]);

    expect(serviziAttiviPino(record)).toEqual([
      { nome: "Visita cardiologica", prezzo: 90, durataMin: null },
    ]);
    expect(negozioOffreServizioPino(record, "visita")).toBe(true);
  });

  test("servizio strutturato inattivo: mai proposto", () => {
    const record = negozioServizi([{ ...TAGLIO, attivo: false }], [], {
      descrizione: "Taglio capelli su appuntamento",
    });

    expect(serviziAttiviPino(record)).toEqual([]);
    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
    expect(filtraNegoziPerServizioPino([record], "taglio")).toEqual([]);
  });

  test("prezzo e durata assenti o non validi: nessun valore inventato", () => {
    const record = negozioServizi([
      { nome: "Taglio barba" },
      { nome: "Taglio bambino", prezzo: 0, durata_min: -5 },
    ]);

    expect(serviziAttiviPino(record)).toEqual([
      { nome: "Taglio barba", prezzo: null, durataMin: null },
      { nome: "Taglio bambino", prezzo: null, durataMin: null },
    ]);
  });

  test("un servizio superfluo non basta: il match richiede tutti i termini", () => {
    const record = negozioServizi([TAGLIO]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(true);
    expect(negozioOffreServizioPino(record, "taglio barba")).toBe(false);
    expect(negozioOffreServizioPino(record, "colore")).toBe(false);
  });
});

test.describe("S4.4 — tag `negozi.servizi`", () => {
  test("servizio presente solo nei tag: riconosciuto", () => {
    const record = negozioServizi(null, ["taglio", "barba"]);

    expect(serviziAttiviPino(record)).toEqual([]);
    expect(negozioOffreServizioPino(record, "taglio")).toBe(true);
  });

  test("tag non pertinente: nessuna corrispondenza", () => {
    const record = negozioServizi(null, ["pulizia"]);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
  });

  test("la descrizione del negozio non dimostra il servizio", () => {
    const record = negozioServizi(null, [], {
      descrizione: "Siamo specializzati in taglio, barba e colore",
      nome: "Parrucchieri taglio",
    });

    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
    expect(filtraNegoziPerServizioPino([record], "taglio")).toEqual([]);
  });

  test("negozio senza servizi: non proposto per una ricerca di servizio", () => {
    const record = negozioServizi(null);

    expect(negozioOffreServizioPino(record, "taglio")).toBe(false);
  });
});

test.describe("S4.4 — formulazioni inglesi", () => {
  test("'haircut' trova 'Taglio capelli' e viceversa", () => {
    const italiano = negozioServizi([TAGLIO]);
    const inglese = negozioServizi([{ nome: "Haircut", prezzo: 20, durata_min: 45 }]);

    expect(negozioOffreServizioPino(italiano, "haircut")).toBe(true);
    expect(negozioOffreServizioPino(inglese, "taglio")).toBe(true);
    expect(serviziCorrispondentiPino(inglese, "haircut")).toEqual([
      { nome: "Haircut", prezzo: 20, durataMin: 45 },
    ]);
  });

  test("'service' e le parole generiche non allargano il match", () => {
    const record = negozioServizi([{ nome: "Pulizia condotto uditivo", prezzo: 35 }]);

    expect(negozioOffreServizioPino(record, "haircut service")).toBe(false);
    expect(negozioOffreServizioPino(record, "cleaning service")).toBe(true);
  });
});

test.describe("S4.4 — filtro sull'elenco e assenza di risultati", () => {
  test("tiene solo le attività con il servizio richiesto", () => {
    const conTaglio = negozioServizi([TAGLIO], [], { id: "a", nome: "Barberia" });
    const senzaTaglio = negozioServizi([{ nome: "Pulizia viso", prezzo: 25 }], [], {
      id: "b",
      nome: "Centro estetico",
    });

    const filtrati = filtraNegoziPerServizioPino([conTaglio, senzaTaglio], "taglio");
    expect(filtrati.map((n) => n.id)).toEqual(["a"]);
    // Servizio inesistente: zero risultati, nessun ripiego generico.
    expect(filtraNegoziPerServizioPino([conTaglio, senzaTaglio], "idraulico")).toEqual([]);
  });

  test("senza servizio parametro il filtro restituisce gli stessi record", () => {
    const record = [negozioServizi([TAGLIO]), negozioServizi([{ nome: "Pulizia viso" }])];
    expect(filtraNegoziPerServizioPino(record, "")).toBe(record);
    expect(filtraNegoziPerServizioPino(record, "   ")).toBe(record);
  });
});

test.describe("S4.4 — contratto del parametro servizio", () => {
  test("validato e normalizzato senza inventare valori", () => {
    const validati = validaToolParams("searchStores", { query: "barbiere", servizio: "  taglio  " });
    expect(validati.problemi).toEqual([]);
    expect(validati.params).toEqual({ query: "barbiere", servizio: "taglio" });

    const nonValido = validaToolParams("searchStores", { servizio: 42 });
    expect(nonValido.params.servizio).toBeUndefined();
    expect(nonValido.problemi).toContain("servizio_non_valido");
  });

  test("ricerca ordinaria di negozi: nessun servizio aggiunto", () => {
    const validati = validaToolParams("searchStores", { query: "pizzeria", citta: "Cosenza" });
    expect(validati.params).toEqual({ query: "pizzeria", citta: "Cosenza" });
    expect("servizio" in validati.params).toBe(false);
  });

  test("in searchStores il filtro precede il mapping e prezzo/durata non alterano i risultati ordinari", () => {
    const sorgente = readFileSync(join(process.cwd(), "lib", "assistente", "tools.ts"), "utf8");
    const filtro = sorgente.indexOf("filtraNegoziPerServizioPino(attivi, servizioRichiesto)");
    const mapping = sorgente.indexOf("serviziTrovati: serviziCorrispondentiPino");
    expect(filtro).toBeGreaterThan(-1);
    expect(mapping).toBeGreaterThan(-1);
    // Il filtro lavora sui dati grezzi, prima del mapping che perde `data`.
    expect(filtro).toBeLessThan(mapping);
    expect(sorgente).toContain("if (!richiestoServizio) return base;");
  });
});
