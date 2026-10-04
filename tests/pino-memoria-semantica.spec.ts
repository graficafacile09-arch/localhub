import { expect, test } from "@playwright/test";

import {
  applicaMemoriaSemantica,
  interpretaRichiestaPino,
  type PinoSemanticPlan,
} from "../lib/assistente/semantica";
import type { PinoMemoriaVoce } from "../lib/assistente/memoria";
import { analizzaIntentoPino } from "../lib/assistente/intent";

function memoria(
  overrides: Partial<PinoMemoriaVoce> = {}
): PinoMemoriaVoce {
  return {
    termine: "telefonazzo",
    concetto: "telefono",
    tipo: "correzione_semantica",
    frequenza: 4,
    successi: 4,
    fallimenti: 0,
    confidence: 0.8333,
    ...overrides,
  };
}

const pianoVuoto: PinoMemoriaVoce[] = [];

test.describe("Pino — consumo della memoria semantica verificata", () => {
  test("1) applica una correzione appresa a una query semplice", () => {
    expect(
      applicaMemoriaSemantica("cerco un telefonazzo", [memoria()])
    ).toBe("cerco un telefono");
  });

  test("2) corregge il termine anche accanto alla punteggiatura, senza toccare parole più lunghe", () => {
    expect(
      applicaMemoriaSemantica("telefonazzo, non telefonazzolo", [memoria()])
    ).toBe("telefono, non telefonazzolo");
  });

  test("3) non usa una memoria debole o non dedicata alle correzioni", () => {
    expect(
      applicaMemoriaSemantica("cerco un telefonazzo", [
        memoria({ frequenza: 1 }),
        memoria({ confidence: 0.69 }),
        memoria({ tipo: "semantica" }),
      ])
    ).toBe("cerco un telefonazzo");
  });

  test("4) una correzione appresa porta il termine canonico dentro il fast-path", async () => {
    const query = "telefonazzo";
    const analisi = analizzaIntentoPino(query);
    expect(analisi.intent).toBe("generic");

    const piano = await interpretaRichiestaPino(
      query,
      [{ role: "user", content: query }],
      analisi,
      [memoria()]
    );

    expect(piano.surface).toBe("products");
    expect(piano.intent).toBe("product");
    expect(piano.query).toBe("telefono");
  });

  test("5) la memoria correzione non cancella gli altri vincoli della richiesta", async () => {
    const query = "telefonazzo sotto 100";
    const analisi = analizzaIntentoPino(query);

    const piano = await interpretaRichiestaPino(
      query,
      [{ role: "user", content: query }],
      analisi,
      [memoria()]
    );

    expect(piano.surface).toBe("products");
    expect(piano.query).toContain("telefono");
    expect(piano.maxPrice).toBe(100);
  });

  test("6) più correzioni convivono senza sostituzioni parziali indesiderate", () => {
    const risultato = applicaMemoriaSemantica("birrra e telefonazzo", [
      memoria({ termine: "birrra", concetto: "birra" }),
      memoria(),
    ]);

    expect(risultato).toBe("birra e telefono");
  });

  test("7) nessuna memoria lascia la query intatta", () => {
    expect(
      applicaMemoriaSemantica("scarpe da uomo eleganti", pianoVuoto)
    ).toBe("scarpe da uomo eleganti");
  });
});
