import { expect, test } from "@playwright/test";
import { richiestaFilierePino, richiestaNotiziePino } from "../lib/assistente/index";
import { searchFiliere } from "../lib/assistente/tools";
import { ORDINE_FILIERE } from "../lib/filiere-prodotti";

const DOMANDE_FILIERE = [
  "Parlami di filiera",
  "Parlami di filiere",
  "cos'è la filiera",
  "Cos'è la filiera",
  "Che cos'è una filiera",
  "filiera",
  "filiere",
  "Esplora le filiere calabresi",
];

test.describe("Pino — domande sulle filiere calabresi", () => {
  test("ogni domanda sulle filiere attiva la ricerca filiere, non le notizie", () => {
    for (const domanda of DOMANDE_FILIERE) {
      expect(richiestaFilierePino(domanda), domanda).toBe(true);
      expect(richiestaNotiziePino(domanda), domanda).toBe(false);
    }
  });

  test("«Parlami di filiera» e «Esplora le filiere calabresi» restituiscono le 10 filiere", () => {
    for (const domanda of ["Parlami di filiera", "Esplora le filiere calabresi"]) {
      const risultati = searchFiliere(domanda, 10);
      expect(risultati.map((f) => f.nome), domanda).toEqual(ORDINE_FILIERE);
    }
  });

  test("le notizie restano su searchNews se la richiesta le nomina", () => {
    for (const domanda of ["Ultime notizie sulle filiere", "rassegna stampa filiere"]) {
      expect(richiestaFilierePino(domanda), domanda).toBe(false);
      expect(richiestaNotiziePino(domanda), domanda).toBe(true);
    }
  });
});
