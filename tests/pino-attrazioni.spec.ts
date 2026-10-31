import { expect, test } from "@playwright/test";
import { isAttractionNameQuery, searchAttractions } from "../lib/assistente/attrazioni";

test.describe("Pino — ricerca nella guida Attrazioni", () => {
  test("trova i musei dalla domanda al plurale", () => {
    const risultati = searchAttractions("Quali musei ci sono a Castrovillari?");
    expect(risultati.length).toBeGreaterThan(0);
    expect(risultati.some((v) => /muse/i.test(v.nome + " " + v.tipo))).toBe(true);
    expect(risultati.some((v) => v.nome === "Protoconvento Francescano – SiMuCCà")).toBe(true);
    expect(risultati.some((v) => v.nome === "Museo Archeologico")).toBe(true);
  });

  test("trova un museo specifico e conserva i link pertinenti", () => {
    const risultato = searchAttractions("Museo Archeologico Castrovillari")[0];
    expect(risultato?.nome).toBe("Museo Archeologico");
    expect(risultato?.queryMaps).toContain("Castrovillari");
  });

  test("distingue il quartiere La Civita dal borgo Civita", () => {
    expect(searchAttractions("La Civita")[0]?.nome).toBe("La Civita e il centro storico");
  });

  test("riconosce il nome diretto di un luogo anche senza parole turistiche", () => {
    expect(isAttractionNameQuery("La Civita")).toBe(true);
    expect(isAttractionNameQuery("Vorrei visitare Palazzo Varcasia")).toBe(true);
    expect(isAttractionNameQuery("orologio da uomo sotto 100 euro")).toBe(false);
    expect(isAttractionNameQuery("Castrovillari")).toBe(false);
  });

  test("una ricerca commerciale non restituisce attrazioni senza pertinenza", () => {
    expect(searchAttractions("orologio da uomo sotto 100 euro")).toHaveLength(0);
  });
});
