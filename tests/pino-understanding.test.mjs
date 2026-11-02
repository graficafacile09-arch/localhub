import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { rispostaIdentitaPino } from "../lib/assistente/identity.ts";
import { isExplicitFoodProductRequest, isBroadAttractionsRequest } from "../lib/assistente/routing-policy.ts";
import { prodottoIdentificatoDaSoggetto } from "../lib/assistente/product-relevance.ts";
import { prodottoPertinente } from "../lib/assistente/tools.ts";
import {
  normalizzaQueryCatalogo,
  rilevaLinguaPino,
  richiestaApertaOra,
  rilevaLinguaConversazionePino,
} from "../lib/assistente/understanding.ts";

const promptSource = readFileSync(
  new URL("../lib/assistente/prompt.ts", import.meta.url),
  "utf8",
);

test("English budget and alternative wording reduce to the catalog subject", () => {
  assert.equal(rilevaLinguaPino("I'm looking for pasta under 5 euros"), "en");
  assert.equal(normalizzaQueryCatalogo("I'm looking for pasta under 5 euros"), "pasta");
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


test("product search subject must identify the product, not occur only in its description", () => {
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla Bianca di Castrovillari", categoria: "Conserve" }, "olio"), false);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Olio Extra Vergine di Oliva del Pollino", categoria: "Alimentari" }, "olio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Orologio da polso", categoria: "Accessori" }, "orologio"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Filetti di Cipolla", categoria: "Conserve" }, "olio", ["olio"]), false);
});


test("English short conversational messages are detected, including how are you", () => {
  assert.equal(rilevaLinguaPino("Hi Pino, how are you?"), "en");
  assert.equal(rilevaLinguaPino("Would you like to chat?"), "en");
  assert.equal(rilevaLinguaPino("Thanks, that was helpful!"), "en");
  assert.equal(rilevaLinguaPino("Come stai?"), "it");
});

test("Pino keeps the conversation language when a follow-up is short", () => {
  assert.equal(rilevaLinguaConversazionePino([
    { role: "user", content: "I'm looking for a watch under 100 euros" },
    { role: "assistant", content: "I found two products." },
    { role: "user", content: "Show me more" },
    { role: "assistant", content: "Here are more options." },
    { role: "user", content: "Okay" },
  ]), "en");
});


test("Pino switches back to Italian when the user does", () => {
  assert.equal(rilevaLinguaPino("Va bene, grazie"), "it");
  assert.equal(rilevaLinguaConversazionePino([
    { role: "user", content: "I'm looking for a watch under 100 euros" },
    { role: "assistant", content: "I found two products." },
    { role: "user", content: "Va bene, grazie" },
  ]), "it");
});


test("explicit food product requests are routed to the catalog in Italian and English", () => {
  assert.equal(isExplicitFoodProductRequest("I'm looking for pasta under 5 euros"), true);
  assert.equal(isExplicitFoodProductRequest("Cerco pasta sotto 5 euro"), true);
  assert.equal(isExplicitFoodProductRequest("I need some bread"), true);
  assert.equal(isExplicitFoodProductRequest("Vorrei mangiare"), false);
});

test("generic attractions questions are recognized in Italian and English", () => {
  assert.equal(isBroadAttractionsRequest("What attractions can I visit in Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("Quali attrazioni posso visitare a Castrovillari?"), true);
  assert.equal(isBroadAttractionsRequest("I'm looking for pasta"), false);
});


test("food relevance uses product identity, never the seller name", () => {
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Taralli tradizionali", categoria: "Alimentari" }, "pasta"), false);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Pasta artigianale", categoria: "Alimentari" }, "pasta"), true);
  assert.equal(prodottoIdentificatoDaSoggetto({ nome: "Tagliatelle all'uovo", categoria: "Pasta fresca" }, "pasta"), true);
});


const intentSource = readFileSync(
  new URL("../lib/assistente/intent.ts", import.meta.url),
  "utf8",
);
const assistantSource = readFileSync(
  new URL("../lib/assistente/index.ts", import.meta.url),
  "utf8",
);

test("professional searches use a deterministic business-only fast path", () => {
  for (const profession of ["commercialista", "fotografo", "accountant", "photographer"]) {
    assert.ok(intentSource.includes(`"${profession}"`), profession);
  }
  const fastPathStart = assistantSource.indexOf("Professioni riconosciute con certezza");
  const attractionsStart = assistantSource.indexOf("Guida turistica InCittà");
  assert.ok(fastPathStart >= 0);
  assert.ok(attractionsStart > fastPathStart);
  const fastPath = assistantSource.slice(fastPathStart, attractionsStart);
  assert.match(fastPath, /await searchStores\(professione, \{ limit: 8 \}\)/);
  assert.doesNotMatch(fastPath, /searchProducts|searchEvents|searchAttractions|callGeminiText|recuperaMemoria/);
  assert.match(fastPath, /Non risultano \$\{plurale\} nel catalogo InCittà/);
});


test("service searches use a dedicated catalog-only tool", () => {
  const toolsSource = readFileSync(
    new URL("../lib/assistente/tools.ts", import.meta.url),
    "utf8",
  );
  assert.ok(toolsSource.includes("export async function searchServices("));
  assert.ok(toolsSource.includes("return searchStores(query,"));
  assert.ok(assistantSource.includes('case "searchServices":'));
  assert.ok(assistantSource.includes("negozi: await searchServices("));
  assert.ok(promptSource.includes("searchServices: query"));
  assert.ok(promptSource.includes("professionisti e servizi"));
});

test("product relevance rejects unrelated fuzzy candidates for every category", () => {
  const unrelated = [
    { nome: "Vino Magliocco del Pollino", categoria: "Vini" },
    { nome: "Pizza margherita al pezzo", categoria: "Pizzeria" },
    { nome: "Anello con pietra", categoria: "Gioielleria" },
  ];
  for (const product of unrelated) {
    assert.equal(prodottoPertinente(product, ["gatto"], []), false);
  }
  assert.equal(
    prodottoPertinente({ nome: "Olio Extra Vergine di Oliva del Pollino", categoria: "Alimentari" }, ["olio"], []),
    true,
  );
  assert.equal(
    prodottoPertinente({ nome: "Orologio da polso", categoria: "Accessori" }, ["orologio"], []),
    true,
  );

  const toolsSource = readFileSync(new URL("../lib/assistente/tools.ts", import.meta.url), "utf8");
  assert.match(toolsSource, /terminiSignificativi\(q, 10\)/);
  assert.match(toolsSource, /prodottoPertinente\(p, terminiRichiesti, \[\]\)/);
});
