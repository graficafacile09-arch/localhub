import assert from "node:assert/strict";
import test from "node:test";

import {
  filtraProdottiAlimentariPino,
  fraseQualificazionePino,
  qualificazioneDocumentataPino,
} from "../lib/assistente/tools.ts";
import { messaggioQualificazioneRilassataPino } from "../lib/assistente/messaggi-pino.ts";
import { decidiDominioPino } from "../lib/assistente/routing-policy.ts";

function prodotto(overrides = {}) {
  return {
    id: "p",
    nome: "Prodotto",
    categoria: "Alimentari",
    sottocategoria: null,
    marca: null,
    descrizione: null,
    descrizione_completa: null,
    seo_title: null,
    seo_description: null,
    alt_text_immagine: null,
    parole_chiave: [],
    caratteristiche: [],
    prezzo: 10,
    disponibile: true,
    ...overrides,
  };
}

const ids = (prodotti) => prodotti.map((p) => String(p.id));

const pastaComune = prodotto({
  id: "pasta-comune",
  nome: "Pasta di semola",
  descrizione: "Pasta di semola di grano duro.",
});
const pastaSecca = prodotto({
  id: "pasta-secca",
  nome: "Pasta trafilata al bronzo",
  descrizione: "Pasta secca trafilata al bronzo.",
});

test("una qualifica non documentata degrada al soggetto invece di azzerare", () => {
  // Nessuno dei due dichiara «fresca»: prima la risposta era vuota.
  assert.deepEqual(
    ids(filtraProdottiAlimentariPino([pastaComune, pastaSecca], "Cerco pasta fresca", "pasta")),
    ["pasta-comune", "pasta-secca"]
  );

  // Se la qualifica è documentata il filtro resta stretto.
  const pastaFresca = prodotto({
    id: "pasta-fresca",
    nome: "Tagliatelle",
    caratteristiche: ["Pasta fresca"],
  });
  assert.deepEqual(
    ids(
      filtraProdottiAlimentariPino(
        [pastaComune, pastaFresca],
        "Cerco pasta fresca",
        "pasta"
      )
    ),
    ["pasta-fresca"]
  );
});

test("una restrizione alimentare non ammette alternative non verificate", () => {
  assert.deepEqual(
    ids(filtraProdottiAlimentariPino([pastaComune], "Cerco pasta senza glutine", "pasta")),
    []
  );
  const pastaSenzaGlutine = prodotto({
    id: "pasta-senza-glutine",
    nome: "Pasta senza glutine",
    descrizione: "Prodotto senza glutine, certificato.",
  });
  assert.deepEqual(
    ids(
      filtraProdottiAlimentariPino(
        [pastaComune, pastaSenzaGlutine],
        "Cerco pasta senza glutine",
        "pasta"
      )
    ),
    ["pasta-senza-glutine"]
  );
});

test("la quantità esplicita resta un vincolo rigido, non una qualifica", () => {
  const olioUnLitro = prodotto({
    id: "olio-1l",
    nome: "Olio extravergine 1 litro",
    descrizione: "Bottiglia da 1 litro.",
  });
  assert.deepEqual(
    ids(filtraProdottiAlimentariPino([olioUnLitro], "Cerco olio da 2 litri", "olio")),
    []
  );
  // Una quantità esplicita non produce nemmeno una nota di qualifica.
  assert.equal(fraseQualificazionePino("Cerco olio da 2 litri", "olio"), null);
});

test("la frase qualificante viene dalla query, mai dal catalogo", () => {
  assert.equal(fraseQualificazionePino("Cerco olio dop", "olio"), "olio dop");
  assert.equal(fraseQualificazionePino("Cerco olio", "olio"), null);
  assert.equal(fraseQualificazionePino("Cerco olio dop", null), null);
});

test("la qualifica si considera confermata solo se documentata o identità", () => {
  const olioEvo = prodotto({
    id: "olio-evo",
    nome: "Olio Extra Vergine di Oliva",
    descrizione: "Olio extra vergine di oliva del Pollino.",
  });
  const olioSemplice = prodotto({
    id: "olio-semplice",
    nome: "Olio di oliva",
    descrizione: "Olio di oliva.",
  });

  // «evo» è un modo diverso di scrivere l'identità, non una qualifica mancante.
  assert.equal(
    qualificazioneDocumentataPino([olioEvo], "olio", "olio evo"),
    true
  );
  assert.equal(
    qualificazioneDocumentataPino([olioSemplice], "olio", "olio dop"),
    false
  );
});

test("il messaggio dichiara la qualifica non confermata senza dire che manca tutto", () => {
  const italiano = messaggioQualificazioneRilassataPino("it", "olio", "olio dop");
  assert.match(italiano, /«olio dop»/);
  assert.match(italiano, /non trovo un prodotto/);
  assert.match(italiano, /senza attribuirgli quella qualifica/);

  const inglese = messaggioQualificazioneRilassataPino("en", "olio", "olio dop");
  assert.match(inglese, /couldn't find a product labelled/);
  assert.match(inglese, /won't claim that qualifier/);
});

test("la tabella di routing decide il dominio in un solo posto", () => {
  assert.equal(decidiDominioPino("Cinema stasera")?.dominio, "cinema");
  assert.equal(decidiDominioPino("Che eventi ci sono sabato")?.dominio, "eventi");
  assert.equal(
    decidiDominioPino("Cosa vedere a Castrovillari")?.dominio,
    "attrazioni"
  );
  assert.equal(
    decidiDominioPino("Cerco un olio del Pollino")?.dominio,
    "prodotti"
  );
  // Un acquisto vince sull'intento turistico, come nella catena precedente.
  assert.equal(
    decidiDominioPino("Vorrei comprare un souvenir del castello")?.dominio,
    "prodotti"
  );
  // Nessun segnale: la richiesta resta generica.
  assert.equal(decidiDominioPino("pasta"), null);
});
