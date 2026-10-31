import { expect, test } from "@playwright/test";
import { prodottoPertinente } from "../lib/assistente/tools";
import {
  aggiungiMetadatiRicercaAssistente,
  type ProdottoRicercaAssistente,
} from "../lib/negozi";

function prodotto(
  nome: string,
  categoria: string | null,
  descrizione: string | null = null,
  metadata: Partial<ProdottoRicercaAssistente> = {}
): ProdottoRicercaAssistente {
  return {
    id: nome.toLowerCase().replace(/\s+/g, "-"),
    negozio_id: "negozio-test",
    nome,
    descrizione,
    categoria,
    prezzo: 20,
    negozio_nome: "Negozio test",
    immagine_principale: null,
    ...metadata,
  };
}

test.describe("Pino — recupero prodotti senza falsi negativi", () => {
  test("un aggettivo non presente nella scheda non azzera il soggetto trovato", () => {
    expect(
      prodottoPertinente(
        prodotto("Orologio classico da polso", "Orologi"),
        ["orologio", "elegante"],
        []
      )
    ).toBe(true);
  });

  test("una parola accessoria non rende pertinente un prodotto di un'altra categoria", () => {
    expect(
      prodottoPertinente(
        prodotto("T-shirt nera", "Abbigliamento"),
        ["tartufo", "nero"],
        []
      )
    ).toBe(false);
  });

  test("la caratteristica analcolica resta un vincolo rigido", () => {
    expect(
      prodottoPertinente(
        prodotto("Birra artigianale", "Bevande"),
        ["birra", "analcolica"],
        []
      )
    ).toBe(false);
    expect(
      prodottoPertinente(
        prodotto("Birra analcolica", "Bevande"),
        ["birra", "analcolica"],
        []
      )
    ).toBe(true);
  });

  test("il mapper interno conserva i campi usati dalla ricerca pubblica", () => {
    const base = prodotto("Miele millefiori 500 g", "Alimentari");
    const mappato = aggiungiMetadatiRicercaAssistente(base, {
      parole_chiave: ["miele", "millefiori", "Pollino"],
      caratteristiche: ["Prodotto tipico"],
      marca: "Apicoltura locale",
    });

    expect(mappato.parole_chiave).toContain("Pollino");
    expect(mappato.caratteristiche).toContain("Prodotto tipico");
    expect(mappato.marca).toBe("Apicoltura locale");
  });

  test("recupera i prodotti quando la corrispondenza è nei metadati indicizzati", () => {
    expect(
      prodottoPertinente(
        prodotto(
          "Miele millefiori 500 g",
          "Alimentari",
          "Miele millefiori, prodotto dimostrativo nella selezione delle eccellenze.",
          {
            parole_chiave: ["miele", "millefiori", "Pollino"],
          }
        ),
        ["miele", "pollino"],
        []
      )
    ).toBe(true);

    expect(
      prodottoPertinente(
        prodotto(
          "Orologio cronografo da uomo con cinturino in pelle marrone",
          "Accessori",
          "Elegante cronografo con cassa color oro brunito, quadrante dettagliato con tre sotto-quadranti e cinturino in pelle marrone con cuciture decorative a contrasto.",
          {
            marca: "Fossil",
          }
        ),
        ["fossil"],
        []
      )
    ).toBe(true);

    expect(
      prodottoPertinente(
        prodotto("Orologio da polso", "Accessori", null, {
          colore: "Blu",
          materiale: "Acciaio",
          caratteristiche: ["Quadrante blu", "Cinturino in acciaio"],
        }),
        ["acciaio"],
        []
      )
    ).toBe(true);
  });

  test("pasta all'uovo richiede una prova nel nome o nei metadati descrittivi", () => {
    expect(
      prodottoPertinente(
        prodotto("Tagliatelle all'uovo", "Alimentari"),
        ["pasta", "uovo"],
        []
      )
    ).toBe(true);
    expect(
      prodottoPertinente(
        prodotto("Pasta fresca", "Pasta", "Preparata con uova fresche"),
        ["pasta", "uovo"],
        []
      )
    ).toBe(true);
    expect(
      prodottoPertinente(
        prodotto("Biscotti all'uovo", "Pasta"),
        ["pasta", "uovo"],
        []
      )
    ).toBe(false);
  });
});
