import { expect, test } from "@playwright/test";
import { cercaConoscenzaPino } from "../lib/assistente/conoscenza";

test.describe("Pino — conoscenza pubblica InCittà", () => {
  test("indirizza al Regolamento Consegne con una risposta coerente", () => {
    const r = cercaConoscenzaPino("regolamento consegne");
    expect(r?.url).toBe("/regolamento-consegne");
    expect(r?.risposta.toLowerCase()).toContain("consegne");
    expect(r?.risposta.toLowerCase()).toContain("venditori");
  });

  test("spiega i metodi di pagamento senza inventare disponibilità", () => {
    const r = cercaConoscenzaPino("quali metodi di pagamento posso usare?");
    expect(r).not.toBeNull();
    expect(r?.risposta).toContain("checkout");
  });

  test("risponde alla domanda su come fare un ordine", () => {
    const r = cercaConoscenzaPino("come faccio un ordine?");
    expect(r).not.toBeNull();
    expect(r?.risposta.toLowerCase()).toContain("carrello");
  });

  test("non intercetta una ricerca di prodotto come se fosse una FAQ", () => {
    expect(cercaConoscenzaPino("orologio da uomo sotto 100 euro")).toBeNull();
  });
});
