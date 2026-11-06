import assert from "node:assert/strict";
import test from "node:test";

import {
  allergeneAlimentarePino,
  condizioneAlimentarePino,
  filtraProdottiAlimentariPino,
  fraseQualificazionePino,
  qualificazioneDocumentataPino,
  restrizioneAlimentareRigidaPino,
} from "../lib/assistente/tools.ts";
import {
  messaggioCondizioneAlimentarePino,
  messaggioQualificazioneRilassataPino,
} from "../lib/assistente/messaggi-pino.ts";
import { decidiDominioPino } from "../lib/assistente/routing-policy.ts";
import { rilevaAzioneNonDisponibilePino } from "../lib/assistente/capacita.ts";

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

test("celiachia e allergia al lattosio attivano il filtro rigido anche come condizione", () => {
  const paneComune = prodotto({
    id: "pane-comune",
    nome: "Pane Casereccio",
    categoria: "Panificio",
    descrizione: "Pane di semola di grano duro.",
  });
  const paneSenzaGlutine = prodotto({
    id: "pane-senza-glutine",
    nome: "Pane senza glutine",
    categoria: "Panificio",
    descrizione: "Prodotto senza glutine, certificato.",
  });
  const formaggio = prodotto({
    id: "formaggio",
    nome: "Pecorino del Monte Poro",
    categoria: "Alimentari",
    descrizione: "Formaggio di latte ovino.",
  });

  assert.equal(restrizioneAlimentareRigidaPino("Sono celiaco, cerco pane"), "senza glutine");
  assert.equal(
    restrizioneAlimentareRigidaPino("sono ciliaco trovami la pasta"),
    "senza glutine"
  );
  assert.equal(condizioneAlimentarePino("sono ciliaco trovami la pasta"), "celiachia");
  assert.deepEqual(
    ids(filtraProdottiAlimentariPino([paneComune], "Sono celiaco, cerco pane", "pane")),
    []
  );
  assert.deepEqual(
    ids(
      filtraProdottiAlimentariPino(
        [paneComune, paneSenzaGlutine],
        "Sono celiaco, cerco pane",
        "pane"
      )
    ),
    ["pane-senza-glutine"]
  );

  const pastaComune = prodotto({
    id: "pasta-comune",
    nome: "Pasta di grano duro",
    categoria: "Alimentari",
    descrizione: "Pasta di semola di grano duro.",
  });
  const pastaSenzaGlutine = prodotto({
    id: "pasta-senza-glutine",
    nome: "Pasta senza glutine",
    categoria: "Alimentari",
    descrizione: "Prodotto senza glutine, certificato.",
  });
  assert.deepEqual(
    ids(
      filtraProdottiAlimentariPino(
        [pastaComune, pastaSenzaGlutine],
        "sono ciliaco trovami la pasta",
        "pasta"
      )
    ),
    ["pasta-senza-glutine"]
  );

  assert.equal(
    restrizioneAlimentareRigidaPino("Ho un'allergia al lattosio, cerco formaggio"),
    "senza lattosio"
  );
  assert.deepEqual(
    ids(
      filtraProdottiAlimentariPino(
        [formaggio],
        "Ho un'allergia al lattosio, cerco formaggio",
        "formaggio"
      )
    ),
    []
  );
});

test("un allergene non verificabile non produce consigli alimentari", () => {
  assert.equal(
    allergeneAlimentarePino("Sono allergico alle noci, cerco biscotti"),
    "frutta a guscio"
  );
  assert.equal(
    condizioneAlimentarePino("Sono allergico alle noci, cerco biscotti"),
    "allergia a frutta a guscio"
  );
  assert.equal(condizioneAlimentarePino("Sono allergico ai pollini"), null);
  assert.match(
    messaggioCondizioneAlimentarePino("it", "allergia a frutta a guscio"),
    /Non posso verificare/
  );
  assert.match(
    messaggioCondizioneAlimentarePino("en", "celiachia", "senza glutine"),
    /can't verify/i
  );
});

test("le azioni non eseguibili sono riconosciute prima delle FAQ", () => {
  assert.equal(
    rilevaAzioneNonDisponibilePino("Vorrei prenotare un tavolo per stasera"),
    "prenotazione"
  );
  assert.equal(rilevaAzioneNonDisponibilePino("Puoi ordinare tu per me?"), "ordine");
  assert.equal(rilevaAzioneNonDisponibilePino("Posso annullare un ordine?"), "annullamento");
  assert.equal(
    rilevaAzioneNonDisponibilePino("Qual è il tuo numero di telefono?"),
    "contatto"
  );
  assert.equal(rilevaAzioneNonDisponibilePino("Come posso contattare InCittà?"), "contatto");
  // Le domande informative restano alle FAQ pubblicate.
  assert.equal(rilevaAzioneNonDisponibilePino("Come faccio un ordine?"), null);
  assert.equal(
    rilevaAzioneNonDisponibilePino("Quali metodi di pagamento posso utilizzare?"),
    null
  );
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
