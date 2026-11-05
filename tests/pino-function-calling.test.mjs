/**
 * P1.1 — Function Calling nativo Gemini, senza chiamate reali.
 *
 * Il provider è sempre mockato. Questi test verificano contratto,
 * dichiarazioni, parsing, validazione, budget, directReply e fallback.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOL_DEFINITIONS,
  buildNativeToolDeclarations,
  buildToolMenuPrompt,
  directReplyAmmessoPino,
  parseNativeFunctionCalls,
  parametriObbligatoriPresentiPino,
} from "../lib/assistente/function-calling.ts";
import { CONTRATTI_STRUMENTO } from "../lib/assistente/tools.ts";
import { selezionaStrumentiNativoPino } from "../lib/assistente/index.ts";

const BASE = {
  systemPrompt: "test",
  userPrompt: "test",
  limiti: null,
  surface: null,
  intent: null,
};

const run = (calls, text = "", extra = {}) =>
  selezionaStrumentiNativoPino(
    { ...BASE, ...extra },
    async () => ({ calls, text })
  );

test("dichiara tutti gli otto strumenti esposti e lascia il regalo interno", () => {
  assert.equal(TOOL_DEFINITIONS.length, 9);
  assert.equal(TOOL_DEFINITIONS.filter((t) => t.exposed).length, 8);

  const dichiarazioni = buildNativeToolDeclarations();
  const nomi = dichiarazioni.map((d) => d.name).sort();
  assert.deepEqual(nomi, [
    "getCategories",
    "getWeather",
    "searchAll",
    "searchEvents",
    "searchOffers",
    "searchPharmacies",
    "searchProducts",
    "searchStores",
  ]);
  assert.ok(!nomi.includes("searchGiftCategories"));

  for (const dichiarazione of dichiarazioni) {
    assert.equal(dichiarazione.parametersJsonSchema.type, "object");
    assert.equal(dichiarazione.parametersJsonSchema.additionalProperties, false);
    assert.ok(dichiarazione.parametersJsonSchema.properties);
    assert.ok(!("prezzoRigido" in dichiarazione.parametersJsonSchema.properties));
  }

  const menu = buildToolMenuPrompt();
  for (const nome of nomi) assert.ok(menu.includes(nome));
  assert.ok(!menu.includes("searchGiftCategories"));
});

test("schema, chiavi ammesse e validatore usano lo stesso contratto", () => {
  for (const definizione of TOOL_DEFINITIONS) {
    const ammesse = new Set(CONTRATTI_STRUMENTO[definizione.name]);
    for (const chiave of Object.keys(definizione.parameters.properties)) {
      assert.ok(
        ammesse.has(chiave),
        `${definizione.name}.${chiave} dichiarata ma non ammessa`
      );
    }
    for (const chiave of definizione.allowedParams) {
      if (chiave === "prezzoRigido") continue;
      assert.ok(
        chiave in definizione.parameters.properties,
        `${definizione.name}.${chiave} ammessa ma non dichiarata`
      );
    }
    for (const obbligatorio of definizione.parameters.required ?? []) {
      assert.ok(obbligatorio in definizione.parameters.properties);
    }
  }
});

test("scarta parametri obbligatori mancanti prima dell'esecuzione", async () => {
  const esito = await run([{ name: "searchProducts", args: {} }]);
  assert.equal(esito.ok, false);
  assert.equal(esito.motivo, "nessuna_selezione");
  assert.deepEqual(esito.scartate, ["searchProducts"]);
});

test("scarta tipi errati e chiavi sconosciute lasciando i parametri validi", async () => {
  const esito = await run([
    {
      name: "searchProducts",
      args: {
        query: "pasta",
        limit: "non-un-numero",
        maxPrice: "dieci",
        chiaveSconosciuta: "x",
      },
    },
  ]);
  assert.equal(esito.ok, true);
  assert.equal(esito.invocazioni.length, 1);
  assert.deepEqual(esito.invocazioni[0].params, { query: "pasta" });
});

test("rifiuta strumenti non autorizzati e forme provider non valide", async () => {
  const nonAutorizzato = await run([
    { name: "searchGiftCategories", args: { termini: ["regalo"] } },
    { name: "adminDelete", args: {} },
  ]);
  assert.equal(nonAutorizzato.ok, false);
  assert.deepEqual(nonAutorizzato.scartate, [
    "searchGiftCategories",
    "adminDelete",
  ]);

  const jsonInvalido = await run("non-array", "");
  assert.equal(jsonInvalido.ok, false);

  const callInvalida = await run([{ name: 123, args: {} }], "");
  assert.equal(callInvalida.ok, false);
});

test("limita a tre invocazioni anche con più function calls", async () => {
  const esito = await run([
    { name: "searchProducts", args: { query: "uno" } },
    { name: "searchProducts", args: { query: "due" } },
    { name: "searchProducts", args: { query: "tre" } },
    { name: "searchProducts", args: { query: "quattro" } },
  ]);
  assert.equal(esito.ok, true);
  assert.equal(esito.invocazioni.length, 3);
  assert.deepEqual(
    esito.invocazioni.map((t) => t.params.query),
    ["uno", "due", "tre"]
  );
});

test("applica il budget deterministico e ignora prezzoRigido del modello", async () => {
  const budgetNegativo = await run(
    [
      {
        name: "searchProducts",
        args: { query: "pasta", maxPrice: 999, prezzoRigido: true },
      },
    ],
    "",
    { limiti: { minPrice: null, maxPrice: 0 } }
  );
  assert.equal(budgetNegativo.ok, true);
  assert.deepEqual(budgetNegativo.invocazioni[0].params, {
    query: "pasta",
    maxPrice: 0,
    prezzoRigido: true,
  });

  const budgetPositivo = await run(
    [
      {
        name: "searchProducts",
        args: { query: "pasta", maxPrice: 999, prezzoRigido: false },
      },
    ],
    "",
    { limiti: { minPrice: 5, maxPrice: 50 } }
  );
  assert.deepEqual(budgetPositivo.invocazioni[0].params, {
    query: "pasta",
    minPrice: 5,
    maxPrice: 50,
    prezzoRigido: true,
  });

  const senzaBudget = await run(
    [
      {
        name: "searchProducts",
        args: { query: "pasta", prezzoRigido: true },
      },
    ]
  );
  assert.equal("prezzoRigido" in senzaBudget.invocazioni[0].params, false);
});

test("directReply è vietato per il catalogo e ammesso per la conversazione", async () => {
  const catalogo = await run(
    [],
    "Ecco alcuni prodotti inventati.",
    { surface: "products", intent: "product" }
  );
  assert.equal(catalogo.ok, false);
  assert.equal(catalogo.motivo, "direct_reply_non_ammesso");

  const conversazione = await run(
    [],
    "Ciao, sono Pino.",
    { surface: null, intent: "greeting" }
  );
  assert.equal(conversazione.ok, true);
  assert.equal(conversazione.directReply, "Ciao, sono Pino.");

  assert.equal(directReplyAmmessoPino({ surface: "stores" }), false);
  assert.equal(directReplyAmmessoPino({ intent: "gift" }), false);
  assert.equal(directReplyAmmessoPino({ intent: "greeting" }), true);
});

test("un timeout o errore provider produce fallback senza esecuzione", async () => {
  const esito = await selezionaStrumentiNativoPino(
    { ...BASE, limiti: null },
    async () => {
      const errore = new Error("Timeout chiamata Gemini Function Calling");
      errore.name = "TimeoutError";
      throw errore;
    }
  );
  assert.equal(esito.ok, false);
  assert.equal(esito.motivo, "provider_error");
});

test("required del contratto e parser rifiutano valori vuoti", () => {
  assert.equal(
    parametriObbligatoriPresentiPino("searchProducts", { query: "  " }),
    false
  );
  assert.equal(
    parametriObbligatoriPresentiPino("searchProducts", { query: "pasta" }),
    true
  );
  assert.deepEqual(parseNativeFunctionCalls(null), []);
  assert.deepEqual(parseNativeFunctionCalls([{ name: "searchAll", args: [] }]), []);
  assert.deepEqual(parseNativeFunctionCalls([{ name: "searchAll", args: { query: "x" } }]), [
    { name: "searchAll", args: { query: "x" } },
  ]);
});
