import assert from "node:assert/strict";
import test from "node:test";
import { rispostaIdentitaPino } from "../lib/assistente/identity.ts";
import { SYSTEM_PROMPT } from "../lib/assistente/prompt.ts";
import {
  normalizzaQueryCatalogo,
  rilevaLinguaPino,
} from "../lib/assistente/understanding.ts";

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
  assert.match(SYSTEM_PROMPT, /Sei Pino, l'assistente AI ufficiale di InCittà\.online/);
  assert.match(SYSTEM_PROMPT, /Non inventare mai negozi, prodotti, prezzi/);
  assert.match(SYSTEM_PROMPT, /Se la richiesta è abbastanza chiara, agisci e cerca subito/);
});
