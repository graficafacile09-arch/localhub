import { expect, test } from "@playwright/test";

import { analizzaIntentoPino } from "../lib/assistente/intent";
import {
  interpretaRichiestaPino,
  soggettoNegozioCategoria,
} from "../lib/assistente/semantica";
import { searchStores } from "../lib/assistente/tools";
import type { PinoMemoriaVoce } from "../lib/assistente/memoria";

const NESSUNA_MEMORIA: PinoMemoriaVoce[] = [];

async function piano(query: string) {
  return interpretaRichiestaPino(
    query,
    [{ role: "user", content: query }],
    analizzaIntentoPino(query),
    NESSUNA_MEMORIA
  );
}

// Le domande su ATTIVITÀ che vendono una categoria devono restare sulla
// superficie negozi, con il soggetto reale al posto della frase intera.
// Se il predicato ("quali negozi vendono") finisce nella query, il gate delle
// attività non trova nulla e la ricerca viene forzata sui prodotti.
test.describe("Pino — attività che vendono una categoria", () => {
  test("1) 'quali negozi vendono scarpe' usa la superficie negozi e il soggetto", async () => {
    const p = await piano("Quali negozi vendono scarpe?");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("scarpe");
    expect(p.query).not.toMatch(/negozi|vendono|quali/);
    expect(p.confidence).toBe("alta");
  });

  test("2) 'cerco negozi di scarpe' non diventa una ricerca prodotto", async () => {
    const p = await piano("Cerco negozi di scarpe.");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("scarpe");
  });

  test("3) gli attributi della categoria restano nel soggetto", async () => {
    expect(soggettoNegozioCategoria("quali negozi che vendono scarpe da uomo")).toBe(
      "scarpe da uomo"
    );
  });

  test("3b) il predicato finale della domanda non resta nel soggetto", async () => {
    const p = await piano("Che negozi di scarpe ci sono?");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("scarpe");
  });

  test("4) la stessa forma in inglese usa il soggetto tradotto", async () => {
    const p = await piano("Which shops sell shoes?");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("scarpe");
  });

  test("5) una categoria alimentare resta sulle attività", async () => {
    const p = await piano("Quali negozi vendono pane?");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("pane");
  });

  test("6) la ricerca dei prodotti non cambia per una richiesta di prodotto", async () => {
    const p = await piano("scarpe da uomo eleganti sotto 100");
    expect(p.surface).toBe("products");
    expect(p.query).toBe("scarpe da uomo eleganti");
    expect(p.maxPrice).toBe(100);
  });

  test("7) la ricerca delle attività aperte ora non cambia", async () => {
    const p = await piano("pizzeria aperta ora");
    expect(p.surface).toBe("stores");
    expect(p.query).toBe("pizzeria");
    expect(p.openNow).toBe(true);
  });

  test("8) il catalogo reale risponde alle attività che vendono pane", async () => {
    // Il catalogo raggiungibile dal test contiene panifici: se non è
    // raggiungibile (nessuna credenziale DB) il test non può misurare i dati.
    const negozi = await searchStores("pane", { limit: 8 });
    test.skip(negozi.length === 0, "catalogo non raggiungibile dal test");

    expect(
      negozi.some((n) =>
        /panificio|forno|pane/i.test(
          `${n.nome} ${n.categoria ?? ""} ${n.descrizione ?? ""}`
        )
      )
    ).toBe(true);
  });

  test("9) una categoria merceologica trova le attività per categoria", async () => {
    // "abbigliamento" è una categoria reale del catalogo: la ricerca delle
    // attività deve arrivarci tramite categoria/descrizione, non tramite nome.
    const negozi = await searchStores("abbigliamento", { limit: 8 });
    test.skip(negozi.length === 0, "catalogo non raggiungibile dal test");

    expect(
      negozi.some((n) => /abbigliamento/i.test(`${n.categoria ?? ""} ${n.descrizione ?? ""}`))
    ).toBe(true);
  });
});
