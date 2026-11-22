import test from "node:test";
import assert from "node:assert/strict";
await import("./support/hook-radiscan.mjs");

const { classificaTerritorioDichiarato } = await import("../lib/radiscan/filiera.ts");
const { decoRiconosciuta, decoRilevata, èCipollaBiancaCastrovillari } = await import("../components/radiscan/logica.ts");

test("DE.CO. è riconosciuta solo con riscontro ufficiale esatto", () => {
  assert.equal(decoRiconosciuta([{
    tipo: "ufficiale",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Corrispondenza esatta con la denominazione comunale",
  }]), true);
  assert.equal(decoRiconosciuta([{
    tipo: "informativa",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Corrispondenza esatta",
  }]), false);
  assert.equal(decoRiconosciuta([{
    tipo: "ufficiale",
    stato: "registrata",
    schemaQualita: "DECO",
    relazione: "Denominazione simile",
  }]), false);
});

test("la sigla DE.CO. viene rilevata ma non certificata automaticamente", () => {
  assert.equal(decoRilevata("DECO"), true);
  assert.equal(decoRilevata(null, ["Marchio DE.CO. presente"]), true);
  assert.equal(decoRilevata(null, [], ["DE CO"]), true);
  assert.equal(decoRilevata(null, ["prodotto tradizionale"]), false);
});

test("i 24 comuni lucani del Parco del Pollino sono ammessi", () => {
  const comuni = [
    "Calvera", "Carbone", "Castelluccio Inferiore", "Castelluccio Superiore",
    "Castelsaraceno", "Castronuovo Sant’Andrea", "Cersosimo", "Chiaromonte",
    "Episcopia", "Fardella", "Francavilla in Sinni", "Latronico", "Lauria",
    "Noepoli", "Rotonda", "San Costantino Albanese", "San Giorgio Lucano",
    "San Paolo Albanese", "San Severino Lucano", "Senise", "Teana",
    "Terranova di Pollino", "Valsinni", "Viggianello",
  ];
  for (const comune of comuni) {
    assert.equal(classificaTerritorioDichiarato(comune)?.tipo, "pollino_lucano", comune);
  }
  assert.equal(comuni.length, 24);
});

test("territori italiani fuori Calabria sono classificati come esterni", () => {
  for (const luogo of ["Basilicata", "Puglia", "Campania", "Toscana", "Lazio", "Sicilia"]) {
    assert.equal(classificaTerritorioDichiarato(luogo)?.tipo, "fuori_calabria", luogo);
  }
  assert.equal(classificaTerritorioDichiarato("Calabria"), null);
  assert.equal(classificaTerritorioDichiarato("Cosenza, Calabria"), null);
});

test("il riconoscimento Pollino non scatta per comuni lucani fuori elenco", () => {
  assert.equal(classificaTerritorioDichiarato("Matera")?.tipo, "fuori_calabria");
  assert.equal(classificaTerritorioDichiarato("Potenza")?.tipo, "fuori_calabria");
});


test("la Cipolla Bianca di Castrovillari resta DE.CO. e non viene promossa a DOP", () => {
  assert.equal(èCipollaBiancaCastrovillari("Cipolla Bianca di Castrovillari"), true);
  assert.equal(èCipollaBiancaCastrovillari("cipolla bianca Castrovillari - prodotto tipico"), true);
  assert.equal(èCipollaBiancaCastrovillari("Cipolla Bianca di Tropea"), false);
  assert.equal(èCipollaBiancaCastrovillari("Cipolla bianca"), false);
});
