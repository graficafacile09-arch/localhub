import { expect, test } from "@playwright/test";

import { analizzaIntentoPino } from "../lib/assistente/intent";
import { pianoLocaleIntelligente } from "../lib/assistente/semantica";
import { strumentoTerritorioFilierePino } from "../lib/assistente/routing-policy";
import {
  searchFiliere,
  searchTerritorio,
} from "../lib/assistente/tools";
import { ORDINE_FILIERE } from "../lib/filiere-prodotti";
import { TERRITORI_ORDINATI } from "../lib/territori";

// Regressione sui chip blu di Pino e sulla domanda «parchi».
// Ogni query deve produrre risultati reali dai dati statici, senza query DB.

const CHIP_FILIERE = "Esplora le filiere calabresi";
const CHIP_DOP = "Cerca un prodotto DOP o IGP";
const CHIP_PARCHI = "Scopri i parchi della Calabria";
const CHIP_PRODUTTORI = "Produttori e eccellenze del territorio";
const DOMANDA_PARCHI = "parchi";

test.describe("Chip Pino: filiere e territorio", () => {
  test("«Esplora le filiere calabresi» restituisce tutte e 10 le filiere", () => {
    const risultati = searchFiliere(CHIP_FILIERE);
    expect(risultati.map((f) => f.nome)).toEqual(ORDINE_FILIERE);
  });

  test("«Cerca un prodotto DOP o IGP» restituisce una panoramica territoriale", () => {
    const territori = searchTerritorio(CHIP_DOP);
    expect(territori.length).toBeGreaterThan(0);
    for (const t of territori) {
      expect(t.riconoscimenti.join(" ")).toMatch(/DOP|IGP|PAT/);
    }
  });

  test("«Scopri i parchi della Calabria» restituisce i parchi", () => {
    const parchi = searchTerritorio(CHIP_PARCHI);
    const attesi = TERRITORI_ORDINATI.filter((t) => t.gruppo === "Parchi");
    expect(parchi.length).toBeGreaterThan(0);
    expect(parchi.every((p) => attesi.some((a) => a.slug === p.slug))).toBe(true);
  });

  test("«Ultime notizie sulle filiere» non è filtrata a zero dal tool filiere", () => {
    const risultati = searchFiliere("Ultime notizie sulle filiere");
    expect(risultati.length).toBe(ORDINE_FILIERE.length);
  });

  test("«Produttori e eccellenze del territorio» restituisce territori e filiere", () => {
    expect(searchTerritorio(CHIP_PRODUTTORI).length).toBeGreaterThan(0);
    expect(searchFiliere(CHIP_PRODUTTORI).length).toBe(ORDINE_FILIERE.length);
  });

  test("«parchi» (plurale) trova i parchi, come «parco» singolare", () => {
    const plurale = searchTerritorio(DOMANDA_PARCHI).map((t) => t.slug);
    const singolare = searchTerritorio("parco").map((t) => t.slug);
    expect(plurale.length).toBeGreaterThan(0);
    const parchiVeri = TERRITORI_ORDINATI.filter((t) => t.gruppo === "Parchi").map((t) => t.slug);
    expect(plurale).toEqual(parchiVeri);
    expect(singolare).toEqual(expect.arrayContaining(plurale));
  });

  test("query ampie e singolare/plurale sui gruppi territorio", () => {
    expect(searchTerritorio("tutti i parchi").length).toBeGreaterThan(0);
    expect(searchTerritorio("comuni").length).toBeGreaterThan(0);
    expect(searchTerritorio("comune").length).toBeGreaterThan(0);
    expect(searchFiliere("filiere").length).toBe(ORDINE_FILIERE.length);
  });
});

test.describe("Routing deterministico dei chip e di «parchi»", () => {
  const frasiTerritorio = [CHIP_FILIERE, CHIP_DOP, CHIP_PARCHI, CHIP_PRODUTTORI, DOMANDA_PARCHI, "parco"];

  for (const frase of frasiTerritorio) {
    test(`«${frase}» non finisce sul piano prodotti`, () => {
      const analisi = analizzaIntentoPino(frase);
      const piano = pianoLocaleIntelligente(frase, analisi);
      expect(piano?.surface).not.toBe("products");
    });

    test(`«${frase}» è instradata a filiere o territorio`, () => {
      expect(strumentoTerritorioFilierePino(frase)).not.toBeNull();
    });
  }
});
