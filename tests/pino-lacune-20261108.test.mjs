import assert from "node:assert/strict";
import test from "node:test";

import {
  queryOfferteEventiPino,
  rispostaServiziAttivitaPino,
  rispostaVariantiProdottoPino,
} from "../lib/assistente/index.ts";
import {
  estraiSoggettoServiziAttivitaPino,
  rilevaRichiestaServiziAttivitaPino,
} from "../lib/assistente/info-attivita.ts";
import {
  rilevaRichiestaVariantiProdottoPino,
  estraiSoggettoVariantiPino,
} from "../lib/assistente/aggregata.ts";
import { serviziDichiaratiPino } from "../lib/assistente/tools.ts";
import { buildContextoRisultati } from "../lib/assistente/prompt.ts";

test("offerte/eventi per negozio: la cornice viene rimossa, il soggetto resta", () => {
  assert.equal(queryOfferteEventiPino("offerte del Panificio Zini", "offerte"), "panificio zini");
  assert.equal(queryOfferteEventiPino("eventi del Panificio Zini", "eventi"), "panificio zini");
  assert.equal(queryOfferteEventiPino("offerte di Natale", "offerte"), "natale");
  assert.equal(queryOfferteEventiPino("eventi questo weekend", "eventi"), undefined);
  assert.equal(queryOfferteEventiPino("offerte", "offerte"), undefined);
});

test("servizi di un'attività: riconoscimento e soggetto", () => {
  assert.equal(rilevaRichiestaServiziAttivitaPino("quali servizi offre il Panificio Zini?"), true);
  assert.equal(estraiSoggettoServiziAttivitaPino("quali servizi offre il Panificio Zini?"), "panificio zini");
  assert.equal(estraiSoggettoServiziAttivitaPino("servizi del Panificio Zini"), "panificio zini");
  assert.equal(rilevaRichiestaServiziAttivitaPino("offerte del Panificio Zini"), false);
});

test("varianti prodotto: non è un conteggio aggregato", () => {
  assert.equal(rilevaRichiestaVariantiProdottoPino("che varianti ha la Birra Mythos?"), true);
  assert.equal(estraiSoggettoVariantiPino("che varianti ha la Birra Mythos?"), "birra mythos");
  assert.equal(estraiSoggettoVariantiPino("quali varianti di pasta"), "pasta");
});

test("servizi dichiarati: strutturati attivi + tag, senza duplicati né inattivi", () => {
  const servizi = serviziDichiaratiPino({
    data: {
      servizi_strutturati: [
        { nome: "Taglio", prezzo: 18, durata_min: 30, attivo: true },
        { nome: "Trattamento spento", prezzo: 10, attivo: false },
      ],
    },
    servizi: ["Taglio", "Barba"],
  });

  assert.deepEqual(
    servizi.map((servizio) => servizio.nome),
    ["Taglio", "Barba"]
  );
  assert.equal(servizi[0].prezzo, 18);
  assert.equal(servizi[1].prezzo, null);
});

test("varianti e servizi entrano nel contesto finale", () => {
  const contesto = buildContextoRisultati({
    negozi: [
      {
        nome: "Panificio Zini",
        categoria: "Panificio",
        descrizione: null,
        indirizzo: null,
        telefono: null,
        servizi: [{ nome: "Taglio", prezzo: 18, durataMin: 30 }],
      },
    ],
    prodotti: [
      {
        nome: "Birra Mythos",
        prezzo: 3,
        negozio_nome: "Panificio Zini",
        categoria: "Birra",
        descrizione: null,
        varianti: [
          { nome: "Bottiglia 33 cl", prezzo: 3, attributi: { formato: "33 cl" } },
          { nome: "Bottiglia 66 cl", prezzo: 5, attributi: { formato: "66 cl" } },
        ],
      },
    ],
    offerte: [],
    eventi: [],
    notizie: [],
    contenuti: [],
    categorie: [],
    meteo: null,
    farmacie: [],
  });

  assert.match(contesto, /Servizi: Taglio \(€18\)/);
  assert.match(contesto, /Varianti: Bottiglia 33 cl \(€3\), Bottiglia 66 cl \(€5\)/);
});

test("risposta varianti: elenca le varianti reali o dichiara che non ce ne sono", () => {
  const conVarianti = rispostaVariantiProdottoPino(
    [
      {
        id: "p1",
        nome: "Birra Mythos",
        prezzo: 3,
        negozio_nome: "Bottega",
        categoria: "Birra",
        descrizione: null,
        varianti: [
          {
            id: "v1",
            nome: "Bottiglia 33 cl",
            attributi: { formato: "33 cl" },
            prezzo: 3,
            quantita_disponibile: 10,
            quantita_riservata: 0,
            immagine_principale: null,
            attivo: true,
          },
        ],
      },
    ],
    "birra mythos"
  );
  assert.match(conVarianti, /Birra Mythos.*Bottiglia 33 cl — €3/);

  const senzaVarianti = rispostaVariantiProdottoPino(
    [
      {
        id: "p2",
        nome: "Birra Mythos",
        prezzo: 3,
        negozio_nome: "Bottega",
        categoria: "Birra",
        descrizione: null,
        varianti: [],
      },
    ],
    "birra mythos"
  );
  assert.match(senzaVarianti, /nessuna variante attiva pubblicata/);
});

test("risposta servizi: elenca i servizi e dichiara quelli non pubblicati", () => {
  const risposta = rispostaServiziAttivitaPino([
    {
      id: "1",
      nome: "Panificio Zini",
      serviziTrovati: [{ nome: "Taglio", prezzo: 18, durataMin: 30 }],
    },
    { id: "2", nome: "Bottega senza servizi", serviziTrovati: [] },
  ]);

  assert.match(risposta, /Panificio Zini/);
  assert.match(risposta, /Taglio: €18 · circa 30 minuti/);
  assert.match(risposta, /Bottega senza servizi.*nessun servizio pubblicato/);
});
