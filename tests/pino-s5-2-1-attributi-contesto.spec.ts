import { expect, test } from "@playwright/test";

import {
  MASSIMO_INVOCAZIONI_PINO,
  applicaQueryRiservaPino,
  chatConAssistente,
  invocazioniRegaloPino,
  notaContestoAttributiPino,
  soggettoRiservaPino,
  type ToolInvocation,
} from "../lib/assistente/index";
import { analizzaComprensionePino } from "../lib/assistente/semantica";

// ─── S5.2.1: soggetto come riserva e contesto attributi non verificabili ────
//
// Offline: costruzione delle invocazioni e nota deterministica. Il catalogo
// reale (Supabase) non viene interrogato da questa suite.

const u = (content: string) => ({ role: "user" as const, content });

function comprensione(query: string) {
  return analizzaComprensionePino(query, [u(query)]);
}

function invocazione(query: string, params: Record<string, unknown> = {}): ToolInvocation {
  return { tool: "searchProducts", params: { query, ...params } };
}

test.describe("S5.2.1 — soggetto come query di riserva", () => {
  test("una query valida del piano non viene sovrascritta", () => {
    const originali = [invocazione("borsa nera")];
    const risultato = applicaQueryRiservaPino(originali, comprensione("Cerco una borsa nera"));

    expect(risultato[0]?.params?.query).toBe("borsa nera");
  });

  test("query assente o vuota: il soggetto specifico la riempie", () => {
    const risultato = applicaQueryRiservaPino(
      [invocazione(""), { tool: "searchStores", params: {} }],
      comprensione("Cerco scarpe da donna taglia 38")
    );

    expect(risultato[0]?.params?.query).toBe("scarpe");
    expect(risultato[1]?.params?.query).toBe("scarpe");
  });

  test("la riserva non rimuove i vincoli già presenti", () => {
    const risultato = applicaQueryRiservaPino(
      [invocazione("", { maxPrice: 50, esclusioni: ["tessuto"], colori: ["nero"] })],
      comprensione("Cerco una borsa nera non in tessuto entro 50 euro")
    );

    expect(risultato[0]?.params).toMatchObject({
      query: "borsa",
      maxPrice: 50,
      esclusioni: ["tessuto"],
      colori: ["nero"],
    });
  });

  test("i soggetti generici non producono una query di riserva", () => {
    for (const soggetto of ["prodotto", "regalo", "articolo", "cosa", "oggetto", "gift"]) {
      expect(soggettoRiservaPino(soggetto), soggetto).toBeNull();
    }
    const originali = [invocazione("")];
    expect(applicaQueryRiservaPino(originali, comprensione("Cerco un regalo")).at(0)?.params?.query).toBe("");
  });

  test("un criterio esplicito (categoria o servizio) non viene sostituito", () => {
    const risultato = applicaQueryRiservaPino(
      [
        { tool: "searchProducts", params: { categoria: "abbigliamento" } },
        { tool: "searchStores", params: { servizio: "taglio" } },
      ],
      comprensione("Cerco una borsa")
    );

    expect(risultato[0]?.params).toEqual({ categoria: "abbigliamento" });
    expect(risultato[1]?.params).toEqual({ servizio: "taglio" });
  });
});

test.describe("S5.2.1 — destinatario, età, taglia, provenienza come contesto", () => {
  test("regalo per una donna di 30 anni: destinatario ed età conservati, nessun filtro", () => {
    const c = comprensione("Cerco un regalo per una donna di 30 anni entro 100 euro");
    expect(c.attributi.destinatario).toBe("donna");
    expect(c.attributi.eta).toBe(30);

    const nota = notaContestoAttributiPino(c);
    expect(nota).toContain("destinatario (donna)");
    expect(nota).toContain("età (30 anni)");
    expect(nota).toContain("non dispone di dati verificabili");
  });

  test("regalo per un bambino di 5 anni: nessuna idoneità dichiarata", () => {
    const c = comprensione("Cerco un regalo per un bambino di 5 anni");
    const nota = notaContestoAttributiPino(c);

    expect(c.attributi.eta).toBe(5);
    expect(nota).toContain("età (5 anni)");
    expect(nota).not.toMatch(/adatto|ideale per|perfetto per|sicuro per/i);
  });

  test("scarpe taglia 42: taglia contestuale, nessuna disponibilità dichiarata", async () => {
    const query = "Cerco scarpe da donna taglia 42";
    const c = comprensione(query);
    expect(c.attributi.taglie).toEqual(["42"]);

    const nota = notaContestoAttributiPino(c);
    expect(nota).toContain("taglia (42)");
    expect(nota).not.toMatch(/disponibil|in magazzino/i);

    const risposta = await chatConAssistente([u(query)]);
    expect(risposta.risposta).not.toMatch(/disponibil[ei] in taglia|taglia 42 disponibile/i);
  });

  test("prodotto calabrese: provenienza non inventata", () => {
    const c = comprensione("Cerco un prodotto calabrese");
    const nota = notaContestoAttributiPino(c);

    expect(c.attributi.provenienza).toContain("calabrese");
    expect(nota).toContain("provenienza (calabrese)");
    expect(nota).not.toMatch(/è calabrese|prodotto calabrese certificato/i);
  });

  test("prodotto artigianale: nessuna certificazione inventata", () => {
    const c = comprensione("Cerco un prodotto artigianale");
    const nota = notaContestoAttributiPino(c);

    expect(nota).toContain("artigianalità");
    expect(nota).not.toMatch(/certificat|garantito artigianale/i);
  });

  test("senza attributi non verificabili la nota non compare", () => {
    expect(notaContestoAttributiPino(comprensione("Cerco una borsa nera"))).toBeNull();
  });

  test("la nota è localizzata in inglese", () => {
    const c = comprensione("I am looking for a gift for a woman aged 30");
    const nota = notaContestoAttributiPino(c, "en");

    expect(nota).toContain("no verifiable data");
    expect(nota).toContain("recipient (donna)");
  });
});

test.describe("S5.2.1 — vincoli architetturali preservati", () => {
  test("borsa nera non in tessuto: attributi e esclusioni restano", () => {
    const c = comprensione("Cerco una borsa nera non in tessuto");

    expect(c.attributi.colori).toEqual(["nero"]);
    expect(c.esclusioni).toEqual(["tessuto"]);
  });

  test("budget indicativo conservato accanto alla riserva soggetto", () => {
    const c = comprensione("Cerco una borsa entro 50 euro");
    const risultato = applicaQueryRiservaPino(
      [invocazione("", { maxPrice: c.maxPrice ?? undefined })],
      c
    );

    expect(c.maxPrice).toBe(50);
    expect(risultato[0]?.params).toMatchObject({ query: "borsa", maxPrice: 50 });
  });

  test("la ricerca regalo resta entro 3 invocazioni tool", () => {
    expect(invocazioniRegaloPino().length).toBeLessThanOrEqual(MASSIMO_INVOCAZIONI_PINO);
  });

  test("la preferenza linguistica resta invariata", async () => {
    const r = await chatConAssistente([u("I speak English")]);

    expect(r.risposta).toMatch(/english/i);
    expect(r.prodotti).toEqual([]);
    expect(r.negozi).toEqual([]);
  });
});
