import { expect, test } from "@playwright/test";
import { cercaConoscenzaPino } from "../lib/assistente/conoscenza";
import { searchAttractions } from "../lib/assistente/attrazioni";

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
    expect(r?.risposta).toContain("effettivamente disponibili");
  });

  test("le domande su chi gestisce le consegne portano al regolamento corretto", () => {
    for (const domanda of [
      "Chi gestisce le consegne su InCittà?",
      "InCittà manda i corrieri?",
      "Chi è responsabile delle consegne?",
    ]) {
      const r = cercaConoscenzaPino(domanda);
      expect(r?.url).toBe("/regolamento-consegne");
      expect(r?.risposta).toContain("non effettua né organizza materialmente le consegne");
    }
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

test.describe("Pino — indice condiviso della guida locale", () => {
  test("trova eventi già presenti nella pagina Attrazioni", () => {
    const risultati = searchAttractions("I-Fest International Film Festival");
    expect(risultati[0]?.nome).toBe("I-Fest International Film Festival");
    expect(risultati[0]?.url).toContain("castrovillaricittafestival.it");
  });

  test("distingue il quartiere La Civita dal borgo Civita", () => {
    const risultati = searchAttractions("La Civita");
    expect(risultati[0]?.nome).toBe("La Civita e il centro storico");
  });

  test("recupera Palazzo Varcasia con la fonte di riferimento", () => {
    const risultato = searchAttractions("Palazzo Varcasia")[0];
    expect(risultato?.nome).toBe("Palazzo Varcasia");
    expect(risultato?.url).toContain("palazzo-varcasia");
    expect(risultato?.queryMaps).toContain("Castrovillari");
  });

  test("una domanda sui dintorni privilegia esclusivamente le destinazioni esterne", () => {
    const risultati = searchAttractions("Cosa posso visitare nei dintorni di Castrovillari?");
    expect(risultati.length).toBeGreaterThan(0);
    expect(risultati.some((v) => v.nome === "Morano Calabro")).toBe(true);
    expect(risultati.some((v) => v.nome === "Archivio di Stato – Sezione di Castrovillari")).toBe(false);
    expect(risultati.some((v) => v.tipo === "Eventi e festival")).toBe(false);
  });
});
