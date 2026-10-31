import { expect, test } from "@playwright/test";
import { prodottoPertinente } from "../lib/assistente/tools";
import { analizzaIntentoPino } from "../lib/assistente/intent";
import { pianoLocaleIntelligente } from "../lib/assistente/semantica";
import { analizzaRichiesta } from "../lib/ricerca-intento";

const prodotto = (nome: string, descrizione = "", categoria = "Accessori") =>
  ({ id: nome, nome, descrizione, categoria }) as any;

test("il planner separa il soggetto dai dettagli del destinatario", () => {
  const query = "borsa elegante per mia moglie";
  const piano = pianoLocaleIntelligente(query, analizzaIntentoPino(query));
  expect(piano?.query).toContain("borsa");
  expect(piano?.terms).toEqual(["borsa"]);
});

test("il soggetto basta: aggettivo e destinatario non azzerano la ricerca", () => {
  const borsa = prodotto("Borsa a tracolla in pelle", "Borsa artigianale in pelle", "Borse");
  expect(
    prodottoPertinente(borsa, ["borsa"], [], {
      matchAnyTerm: true,
      query: "borsa elegante per mia moglie",
    })
  ).toBe(true);
});

test("il soggetto impedisce falsi positivi provenienti da aggettivi comuni", () => {
  const orologio = prodotto(
    "Orologio LiuJo in acciaio",
    "Elegante orologio da donna con quadrante nero"
  );
  expect(
    prodottoPertinente(orologio, ["borsa"], [], {
      matchAnyTerm: true,
      query: "borsa elegante per mia moglie",
    })
  ).toBe(false);
  expect(
    prodottoPertinente(orologio, ["tartufo"], [], {
      matchAnyTerm: true,
      query: "tartufo nero",
    })
  ).toBe(false);
});

test("i sinonimi del soggetto sono alternative, non parole obbligatorie tutte insieme", () => {
  const scarpa = prodotto("Calzatura sportiva da uomo", "Scarpa comoda", "Calzature");
  expect(
    prodottoPertinente(scarpa, ["scarpe", "calzature"], [], {
      matchAnyTerm: true,
      query: "scarpe comode da uomo",
    })
  ).toBe(true);
});

test("un concetto generico non sostituisce il soggetto esplicito", () => {
  const miele = prodotto("Miele di Castagno del Pollino", "Miele tipico del Pollino", "Alimentari");
  expect(
    prodottoPertinente(miele, ["olio"], ["alimentari"], {
      matchAnyTerm: true,
      query: "olio del Pollino",
    })
  ).toBe(false);
});

test("un vincolo di genere esplicito esclude solo il prodotto dichiarato opposto", () => {
  const donna = prodotto("Orologio LiuJo", "Elegante orologio da donna");
  const neutro = prodotto("Orologio cronografo", "Orologio in acciaio");
  const options = { matchAnyTerm: true, query: "orologio elegante da uomo" };
  expect(prodottoPertinente(donna, ["orologio"], [], options)).toBe(false);
  expect(prodottoPertinente(neutro, ["orologio"], [], options)).toBe(true);
});

test("pasta all'uovo continua a richiedere la lavorazione specifica", () => {
  const tagliatelle = prodotto("Tagliatelle all'uovo", "Pasta fresca", "Alimentari");
  const fileja = prodotto("Fileja di Tropea", "Pasta tradizionale", "Alimentari");
  const options = { matchAnyTerm: true, query: "pasta all'uovo" };
  expect(prodottoPertinente(tagliatelle, ["pasta"], [], options)).toBe(true);
  expect(prodottoPertinente(fileja, ["pasta"], [], options)).toBe(false);
});

test("il fallback senza soggetto semantico mantiene il filtro rigoroso", () => {
  const orologio = prodotto("Orologio da polso", "Cinturino nero");
  const termini = ["tartufo", "nero"];
  const concetti = analizzaRichiesta("tartufo nero").concetti;
  expect(prodottoPertinente(orologio, termini, concetti)).toBe(false);
});
