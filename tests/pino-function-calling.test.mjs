import assert from "node:assert/strict";
import test from "node:test";
import { estraiSelezioneFunctionCalling, functionCallingSelectionIsComplete } from "../lib/assistente/function-calling-utils.ts";

const allowed = new Set(["searchProducts", "searchStores", "getWeather"]);
const clean = (value) => value && typeof value === "object" ? value : {};

test("keeps only declared tools and normalizes their arguments", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [
      { name: "searchProducts", args: { query: "pasta" } },
      { name: "unknownTool", args: { query: "ignored" } },
      { name: "searchStores", args: { query: "panificio" } },
    ],
    text: "This text must not replace tool execution.",
  }, allowed, clean);

  assert.deepEqual(result.tools, [
    { tool: "searchProducts", params: { query: "pasta" } },
    { tool: "searchStores", params: { query: "panificio" } },
  ]);
  assert.equal(result.directReply, null);
});

test("caps the number of function calls", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [
      { name: "searchProducts", args: { query: "pasta" } },
      { name: "searchStores", args: { query: "negozi" } },
      { name: "getWeather", args: {} },
    ],
  }, allowed, clean, 2);

  assert.equal(result.tools.length, 2);
  assert.deepEqual(result.tools.map((tool) => tool.tool), ["searchProducts", "searchStores"]);
});

test("returns a direct reply when Gemini responds without calling a tool", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [],
    text: "Certo, volentieri!",
  }, allowed, clean);

  assert.deepEqual(result.tools, []);
  assert.equal(result.directReply, "Certo, volentieri!");
});

test("represents an empty model response without inventing a tool or reply", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [],
    text: "   ",
  }, allowed, clean);

  assert.deepEqual(result, { tools: [], directReply: null });
});

test("ignores malformed and undeclared function calls", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [
      null,
      { name: "", args: {} },
      { name: "notAllowed", args: {} },
    ],
    text: null,
  }, allowed, clean);

  assert.deepEqual(result, { tools: [], directReply: null });
});


test("an empty selection keeps searchAll fallback for a concrete intent", () => {
  assert.equal(functionCallingSelectionIsComplete({ tools: [], directReply: null }, false), false);
});

test("an empty selection is complete for a generic conversational intent", () => {
  assert.equal(functionCallingSelectionIsComplete({ tools: [], directReply: null }, true), true);
});

test("a direct reply or a tool call completes the selection", () => {
  assert.equal(functionCallingSelectionIsComplete({ tools: [], directReply: "Certo!" }, false), true);
  assert.equal(functionCallingSelectionIsComplete({ tools: [{ tool: "searchProducts", params: {} }], directReply: null }, false), true);
});

test("a zero tool limit returns no tool calls", () => {
  const result = estraiSelezioneFunctionCalling({
    functionCalls: [{ name: "searchProducts", args: { query: "pasta" } }],
  }, allowed, clean, 0);
  assert.deepEqual(result, { tools: [], directReply: null });
});


test("shared Gemini provider parses function calls without executing them", async () => {
  const { callGeminiFunctionCalling } = await import("../lib/ai/gemini-text.ts");
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  let requestBody;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: "searchProducts", args: { query: "pasta", maxPrice: 5 } } },
          ],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await callGeminiFunctionCalling({
      systemPrompt: "Sei Pino.",
      userPrompt: "Cerco pasta sotto 5 euro.",
      functionDeclarations: [{ name: "searchProducts" }],
      fallbackModel: "test-model",
      retries: 1,
    });

    assert.deepEqual(result.functionCalls, [
      { name: "searchProducts", args: { query: "pasta", maxPrice: 5 } },
    ]);
    assert.equal(result.text, null);
    assert.equal(requestBody.tools[0].functionDeclarations[0].name, "searchProducts");
    assert.equal(requestBody.toolConfig.functionCallingConfig.mode, "AUTO");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test("shared Gemini provider returns direct text when no function is requested", async () => {
  const { callGeminiFunctionCalling } = await import("../lib/ai/gemini-text.ts");
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: "Certo, volentieri!" }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const result = await callGeminiFunctionCalling({
      systemPrompt: "Sei Pino.",
      userPrompt: "Ti va di fare due chiacchiere?",
      functionDeclarations: [],
      retries: 1,
    });
    assert.deepEqual(result, { functionCalls: [], text: "Certo, volentieri!" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
