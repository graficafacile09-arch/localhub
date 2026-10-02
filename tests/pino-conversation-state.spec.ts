import { expect, test } from "@playwright/test";

import { arricchisciRichiestaConContesto } from "../lib/assistente/semantica";

const u = (content: string) => ({ role: "user" as const, content });

function contesto(...richieste: string[]) {
  return richieste.map((content) => u(content));
}

test.describe("Pino — stato conversazionale dei filtri", () => {
  test("mantiene soggetto + attributi quando si aggiungono modificatori", () => {
    const richieste = contesto("cerco scarpe da uomo", "eleganti");
    const risultato = arricchisciRichiestaConContesto("eleganti", richieste);

    expect(risultato).toContain("scarpe da uomo");
    expect(risultato).toContain("eleganti");
  });

  test("un nuovo prezzo sostituisce quello precedente", () => {
    const richieste = contesto("cerco scarpe da uomo sotto 100", "eleganti", "anzi sotto 70");
    const risultato = arricchisciRichiestaConContesto("anzi sotto 70", richieste);

    expect(risultato).toContain("scarpe da uomo");
    expect(risultato).toContain("eleganti");
    expect(risultato).toContain("sotto 70");
    expect(risultato).not.toContain("sotto 100");
  });

  test("lascia perdere il prezzo rimuove il limite precedente", () => {
    const richieste = contesto("cerco scarpe da uomo sotto 100", "eleganti", "lascia perdere il prezzo");
    const risultato = arricchisciRichiestaConContesto("lascia perdere il prezzo", richieste);

    expect(risultato).toContain("scarpe da uomo");
    expect(risultato).toContain("eleganti");
    expect(risultato).not.toMatch(/sotto\s*100/i);
    expect(risultato).not.toMatch(/prezzo/i);
  });

  test("una nuova città sostituisce quella precedente", () => {
    const richieste = contesto("cerco scarpe a Castrovillari", "eleganti", "anzi a Cosenza");
    const risultato = arricchisciRichiestaConContesto("anzi a Cosenza", richieste);

    expect(risultato).toContain("scarpe");
    expect(risultato).toContain("cosenza");
    expect(risultato).not.toContain("castrovillari");
  });

  test("le esclusioni precedenti restano attive", () => {
    const richieste = contesto("cerco scarpe da uomo", "non nere", "eleganti");
    const risultato = arricchisciRichiestaConContesto("eleganti", richieste);

    expect(risultato).toContain("scarpe da uomo");
    expect(risultato).toContain("non nere");
    expect(risultato).toContain("eleganti");
  });

  test("una nuova richiesta con un soggetto proprio non eredita il contesto", () => {
    const richieste = contesto("cerco scarpe sotto 100", "eleganti", "pizza");
    const risultato = arricchisciRichiestaConContesto("pizza", richieste);

    expect(risultato).toBe("pizza");
  });
});
