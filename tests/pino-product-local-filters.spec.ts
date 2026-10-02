import { expect, test } from "@playwright/test";

import {
  filtraRisultatiPerVincoliNegozi,
} from "../lib/assistente/tools";
import type { ProdottoRicerca } from "../lib/ricerca-ai";

const prodotto = (id: string, negozio_id: string, nome: string): ProdottoRicerca => ({
  id,
  negozio_id,
  nome,
  descrizione: null,
  categoria: null,
  prezzo: 10,
  negozio_nome: negozio_id,
  immagine_principale: null,
});

test.describe("Pino V12 — vincoli locali sui prodotti", () => {
  test("filtra i prodotti al solo negozio ammesso per città", () => {
    const risultati = [
      prodotto("1", "negozio-cosenza", "Scarpa A"),
      prodotto("2", "negozio-castrovillari", "Scarpa B"),
    ];
    const filtrati = filtraRisultatiPerVincoliNegozi(
      risultati,
      new Set(["negozio-castrovillari"]),
      null
    );

    expect(filtrati.map((p) => p.id)).toEqual(["2"]);
  });

  test("mantiene solo prodotti di negozi realmente aperti", () => {
    const risultati = [
      prodotto("1", "negozio-chiuso", "Scarpa A"),
      prodotto("2", "negozio-aperto", "Scarpa B"),
    ];
    const filtrati = filtraRisultatiPerVincoliNegozi(
      risultati,
      null,
      new Set(["negozio-aperto"])
    );

    expect(filtrati.map((p) => p.id)).toEqual(["2"]);
  });

  test("un filtro esplicito non promuove negozi non verificati", () => {
    const risultati = [
      prodotto("1", "negozio-senza-dati", "Scarpa A"),
      prodotto("2", "negozio-verificato", "Scarpa B"),
    ];
    const filtrati = filtraRisultatiPerVincoliNegozi(
      risultati,
      new Set(["negozio-verificato"]),
      new Set(["negozio-verificato"])
    );

    expect(filtrati.map((p) => p.id)).toEqual(["2"]);
  });
});
