import { expect, test } from "@playwright/test";

import { costruisciStatoConversazionale } from "../lib/assistente/semantica";

const u = (content: string) => ({ role: "user" as const, content });

test.describe("Pino — stato semantico conversazionale", () => {
  test("conserva soggetto, attributi e prezzo nella stessa sessione", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe da uomo"),
      u("eleganti"),
      u("sotto 100"),
    ]);

    expect(stato.attivo).toBe(true);
    expect(stato.query).toBe("scarpe da uomo eleganti");
    expect(stato.maxPrice).toBe(100);
    expect(stato.minPrice).toBeNull();
  });

  test("un nuovo prezzo sostituisce il vecchio nel costo corrente", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe da uomo sotto 100"),
      u("eleganti"),
      u("anzi sotto 70"),
    ]);

    expect(stato.maxPrice).toBe(70);
    expect(stato.richiesta).not.toMatch(/sotto 100/i);
    expect(stato.richiesta).toMatch(/sotto 70/i);
  });

  test("il reset del prezzo cancella il filtro ma mantiene il soggetto", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe da uomo sotto 100"),
      u("eleganti"),
      u("lascia perdere il prezzo"),
    ]);

    expect(stato.attivo).toBe(true);
    expect(stato.query).toBe("scarpe da uomo eleganti");
    expect(stato.maxPrice).toBeNull();
    expect(stato.minPrice).toBeNull();
    expect(stato.richiesta).not.toMatch(/prezzo|sotto\s*100/i);
  });

  test("una nuova città sostituisce quella precedente", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe a Castrovillari"),
      u("eleganti"),
      u("anzi a Cosenza"),
    ]);

    expect(stato.city).toBe("cosenza");
    expect(stato.query).toBe("scarpe eleganti");
    expect(stato.richiesta).not.toMatch(/castrovillari/i);
  });

  test("le esclusioni esplicite restano nello stato", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe da uomo"),
      u("non nere"),
      u("eleganti"),
    ]);

    expect(stato.exclusions).toContain("nere");
    expect(stato.query).toContain("scarpe da uomo eleganti");
  });

  test("un messaggio con un nuovo soggetto apre una nuova ricerca", () => {
    const stato = costruisciStatoConversazionale([
      u("cerco scarpe sotto 100"),
      u("eleganti"),
      u("pizza"),
    ]);

    expect(stato.query).toBe("pizza");
    expect(stato.maxPrice).toBeNull();
    expect(stato.exclusions).toEqual([]);
  });
});
