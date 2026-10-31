import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rispostaIdentitaPino } from "../lib/assistente/identity.ts";
import {
  normalizzaQueryCatalogo,
  rilevaLinguaPino,
  richiestaApertaOra,
} from "../lib/assistente/understanding.ts";

const promptSource = readFileSync(
  new URL("../lib/assistente/prompt.ts", import.meta.url),
  "utf8",
);

test("English budget and alternative wording reduce to the catalog subject", () => {
  const request = "I want a watch under 100 euros, or something similar";
  assert.equal(rilevaLinguaPino(request), "en");
  assert.equal(normalizzaQueryCatalogo(request), "orologio");
});

test("Reported English budget sentence never leaves the word have in the query", () => {
  assert.equal(
    normalizzaQueryCatalogo("I have 100 euros and I want a watch or something similar."),
    "orologio",
  );
});

test("Orphaned English planner terms are removed from catalog query", () => {
  assert.equal(normalizzaQueryCatalogo("have orologio"), "orologio");
});

test("Colloquial English budget wording does not pollute the query", () => {
  assert.equal(
    normalizzaQueryCatalogo("I have 100 euros and want a watch"),
    "orologio",
  );
});

test("English product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("I want a watch with a leather strap under 100 euros"),
    "orologio con cinturino in pelle",
  );
});

test("Italian product attributes are preserved", () => {
  assert.equal(
    normalizzaQueryCatalogo("scarpe da uomo eleganti sotto 100 euro"),
    "scarpe da uomo eleganti",
  );
  assert.equal(rilevaLinguaPino("Ho 100 euro e voglio un orologio"), "it");
});

test("Common English catalog subjects normalize to Italian search terms", () => {
  assert.equal(normalizzaQueryCatalogo("I want shoes under 80 euros"), "scarpe");
  assert.equal(normalizzaQueryCatalogo("Find me a wallet"), "portafoglio");
  assert.equal(normalizzaQueryCatalogo("I need a phone"), "telefono");
});

test("Pino identifies itself consistently in Italian and English", () => {
  assert.match(rispostaIdentitaPino("Chi sei?") ?? "", /Sono Pino/);
  assert.match(rispostaIdentitaPino("What is your name?") ?? "", /I'm Pino/);
  assert.equal(rispostaIdentitaPino("Cerca un orologio"), null);
});

test("Pino system prompt defines identity and proactive grounded behavior", () => {
  assert.match(promptSource, /Sei Pino, l'assistente AI ufficiale di InCittà\.online/);
  assert.match(promptSource, /Non inventare mai negozi, prodotti, prezzi/);
  assert.match(promptSource, /Se la richiesta è abbastanza chiara, agisci e cerca subito/);
});


test("Italian question wording normalizes to the pasta catalog subject", () => {
  assert.equal(normalizzaQueryCatalogo("Quanta pasta avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Che pasta avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Quali paste avete?"), "pasta");
  assert.equal(normalizzaQueryCatalogo("Avete pasta?"), "pasta");
});

test("Open-now wording is recognized in Italian and English and removed from catalog queries", () => {
  assert.equal(richiestaApertaOra("pizzeria aperta ora"), true);
  assert.equal(richiestaApertaOra("pizza open now"), true);
  assert.equal(richiestaApertaOra("pizzeria open right now"), true);
  assert.equal(normalizzaQueryCatalogo("pizza open now"), "pizza");
  assert.equal(normalizzaQueryCatalogo("pizzeria aperta ora"), "pizzeria");
});


import { prodottoIdentificatoDaSoggetto } from "../lib/assistente/product-relevance.ts";

test("product search subject must identify the product, not occur only in its description", () => {
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla Bianca di Castrovillari", categoria: "Conserve" }, "olio"), false);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Olio Extra Vergine di Oliva del Pollino", categoria: "Alimentari" }, "olio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Orologio da polso", categoria: "Accessori" }, "orologio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla", categoria: "Conserve" }, "olio", ["olio"]), false);
});
