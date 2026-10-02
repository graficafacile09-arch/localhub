import { expect, test } from "@playwright/test";

import {
  interpretaRichiestaPino,
  type PinoSemanticPlan,
} from "../lib/assistente/semantica";
import { analizzaIntentoPino } from "../lib/assistente/intent";

const NESSUNA_MEMORIA = [] as PinoSemanticPlan[] as never;

async function piano(query: string) {
  return interpretaRichiestaPino(
    query,
    [{ role: "user", content: query }],
    analizzaIntentoPino(query),
    NESSUNA_MEMORIA
  );
}

test.describe("Pino — separazione query e vincoli semantici", () => {
  test("1) il prezzo diventa filtro e non finisce nella query prodotto", async () => {
    const p = await piano("scarpe da uomo eleganti sotto 100");
    expect(p.surface).toBe("products");
    expect(p.maxPrice).toBe(100);
    expect(p.query).toBe("scarpe da uomo eleganti");
    expect(p.query).not.toMatch(/sotto|100/);
  });

  test("2) il range di prezzo viene separato dalla query", async () => {
    const p = await piano("scarpe tra 50 e 120 euro");
    expect(p.minPrice).toBe(50);
    expect(p.maxPrice).toBe(120);
    expect(p.query).toBe("scarpe");
  });

  test("3) una negazione generica diventa esclusione", async () => {
    const p = await piano("scarpe da uomo non nere");
    expect(p.query).toBe("scarpe da uomo");
    expect(p.exclusions).toContain("nere");
  });

  test("4) 'senza' mantiene il soggetto e separa la caratteristica esclusa", async () => {
    const p = await piano("pizza senza glutine");
    expect(p.surface).toBe("products");
    expect(p.query).toBe("pizza");
    expect(p.exclusions).toContain("glutine");
  });

  test("5) 'analcolica' resta una caratteristica positiva e non viene eliminata", async () => {
    const p = await piano("birra analcolica");
    expect(p.query).toContain("birra");
    expect(p.query).toContain("analcolica");
    expect(p.exclusions).toContain("alcolica");
  });

  test("6) apertura ora viene estratta e non entra nel testo prodotto", async () => {
    const p = await piano("pizzeria aperta ora");
    expect(p.surface).toBe("products");
    expect(p.openNow).toBe(true);
    expect(p.query).toBe("pizzeria");
  });

  test("7) la città riconosciuta diventa vincolo separato", async () => {
    const p = await piano("scarpe a Castrovillari");
    expect(p.city).toBe("castrovillari");
    expect(p.query).toBe("scarpe");
  });

  test("8) gli attributi positivi restano nella query", async () => {
    const p = await piano("scarpe da uomo eleganti");
    expect(p.query).toBe("scarpe da uomo eleganti");
    expect(p.query).not.toMatch(/cerco|voglio|sotto|massimo/);
  });
});
