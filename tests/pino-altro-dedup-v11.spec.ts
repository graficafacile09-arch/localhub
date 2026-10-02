import { expect, test } from "@playwright/test";

import { nomiGiaMostrati } from "../lib/assistente/index";

const u = (role: "user" | "assistant", content: string) => ({ role, content });

test.describe("Pino — deduplica risultati mostrati", () => {
  test("estrae i nomi delle schede già presenti nelle risposte", () => {
    const nomi = nomiGiaMostrati([
      u("assistant", "**Prodotti trovati**\n- **Scarpa Elegante Uomo** — €80 (Negozio A)"),
      u("assistant", "Ecco altre opzioni:\n- **Sneaker Uomo** — €70 (Negozio B)"),
      u("user", "fammi vedere altro"),
    ]);

    expect(nomi).toEqual(
      expect.arrayContaining(["scarpa elegante uomo", "sneaker uomo"])
    );
  });

  test("non confonde una risposta utente con risultati già mostrati", () => {
    const nomi = nomiGiaMostrati([
      u("user", "cerco scarpe"),
      u("assistant", "- **Scarpa Nera** — €50 (Negozio A)"),
      u("user", "fammi vedere altro"),
    ]);

    expect(nomi).toEqual(["scarpa nera"]);
  });
});
