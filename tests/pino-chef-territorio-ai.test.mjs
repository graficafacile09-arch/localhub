import test from "node:test";
import assert from "node:assert/strict";
import { isRichiestaChefSommelierOTerritorio } from "../lib/assistente/routing-policy.ts";
import { formattaContestoTerritorioESito } from "../lib/assistente/conoscenza-territorio-sito.ts";

test("ricette, abbinamenti, territorio e filiere passano alla generazione AI", () => {
  const domande = [
    "parlami di una ricetta tipica calabrese",
    "come cucinare la nduja",
    "che vino abbino alla fileja",
    "quali vitigni calabresi conosco",
    "parlami del Parco del Pollino",
    "cosa sono le filiere di Radici Calabria",
    "cos'è la DOP del caciocavallo silano",
  ];
  for (const domanda of domande) {
    assert.equal(isRichiestaChefSommelierOTerritorio(domanda), true, domanda);
  }
});

test("domande estranee al tema culinario e territoriale non vengono instradate", () => {
  assert.equal(isRichiestaChefSommelierOTerritorio("quanto costa la spedizione"), false);
});

test("borghi, cultura, storia, tradizioni, itinerari e stagionalità passano alla generazione AI", () => {
  const domande = [
    "raccontami la storia di Morano Calabro",
    "quali borghi arbëreshë ci sono nel Pollino",
    "chi erano i grecanici di Bova",
    "cosa resta della Magna Grecia in Calabria",
    "quali tradizioni popolari ci sono a Civita",
    "organizza un itinerario di due giorni nel Pollino",
    "cosa si raccoglie a novembre in Calabria",
    "quali prodotti di stagione trovo adesso",
    "parlami della cultura contadina calabrese",
  ];
  for (const domanda of domande) {
    assert.equal(isRichiestaChefSommelierOTerritorio(domanda), true, domanda);
  }
});

test("meteo, farmacie, parcheggi e orari restano fuori dalla corsia territorio", () => {
  const domande = [
    "che tempo fa domani a Castrovillari",
    "qual è la farmacia di turno stasera",
    "dove posso parcheggiare vicino al centro storico",
    "quali sono gli orari di apertura del museo del borgo",
  ];
  for (const domanda of domande) {
    assert.equal(isRichiestaChefSommelierOTerritorio(domanda), false, domanda);
  }
});

test("il contesto territorio espone contenuti editoriali e stagionalità con link reali", () => {
  const blocco = formattaContestoTerritorioESito({
    territori: [{ slug: "pollino", nome: "Parco del Pollino", gruppo: "Parchi", url: "/territorio/pollino" }],
    denominazioni: [{ nome: "Pecorino Crotonese", schemaQualita: "DOP", territorio: "Crotone" }],
    contenuti: [{
      titolo: "I riti arbëreshë di Civita",
      slug: "riti-arbereshe-civita",
      riassunto: "Un viaggio tra lingua e feste della comunità.",
      url: "/contenuti/riti-arbereshe-civita",
    }],
    stagionalita: {
      mese: "Novembre",
      periodo: "Novembre – Dicembre",
      voci: [{ nome: "Olive da olio", attivita: "raccolta, molitura e olio nuovo", zone: "colline e coste" }],
    },
    pagine: [{ url: "/stagionalita", descrizione: "prodotti di stagione" }],
  });
  assert.match(blocco, /CONTENUTI EDITORIALI PUBBLICATI/);
  assert.match(blocco, /\/contenuti\/riti-arbereshe-civita/);
  assert.match(blocco, /STAGIONALITÀ — Novembre/);
  assert.match(blocco, /Olive da olio: raccolta, molitura e olio nuovo/);
  assert.match(blocco, /\/territorio\/pollino/);
});
