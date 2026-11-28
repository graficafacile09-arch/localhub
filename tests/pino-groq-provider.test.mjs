import assert from "node:assert/strict";
import test from "node:test";
import { callGroqText, callGroqFunctionCalling } from "../lib/ai/groq.ts";

async function conProviderMock(handler, run) {
  const fetchOriginal = globalThis.fetch;
  const keyOriginal = process.env.GROQ_API_KEY;
  const modelOriginal = process.env.GROQ_MODEL;
  process.env.GROQ_API_KEY = "test-groq-key";
  delete process.env.GROQ_MODEL;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = fetchOriginal;
    if (keyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = keyOriginal;
    if (modelOriginal === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = modelOriginal;
  }
}

test("Groq text provider sends system/history/user messages and JSON mode", async () => {
  await conProviderMock(async (url, options) => {
    assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer test-groq-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "openai/gpt-oss-120b");
    assert.deepEqual(body.messages.map((message) => message.role), [
      "system", "user", "assistant", "user",
    ]);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.ok(body.max_completion_tokens >= 700);
    assert.equal(body.reasoning_format, "hidden");
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"route":"catalog"}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }, async () => {
    const result = await callGroqText({
      systemPrompt: "system",
      userPrompt: "find pasta",
      history: [
        { role: "user", content: "hello" },
        { role: "model", content: "hi" },
      ],
      json: true,
      maxTokens: 450,
    });
    assert.equal(result, '{"route":"catalog"}');
  });
});

test("Groq Function Calling returns normalized tool calls and parsed arguments", async () => {
  await conProviderMock(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.reasoning_format, "hidden");
    assert.equal(body.tool_choice, "auto");
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.tools[0].function.name, "searchProducts");
    assert.deepEqual(body.tools[0].function.parameters, {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: "",
          tool_calls: [{
            type: "function",
            function: {
              name: "searchProducts",
              arguments: '{"query":"pasta"}',
            },
          }],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }, async () => {
    const result = await callGroqFunctionCalling({
      systemPrompt: "choose tools",
      userPrompt: "find pasta",
      declarations: [{
        name: "searchProducts",
        description: "search products",
        parametersJsonSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
      }],
    });
    assert.deepEqual(result.calls, [{ name: "searchProducts", args: { query: "pasta" } }]);
    assert.equal(result.text, "");
  });
});

test("Groq provider exposes HTTP status without logging the response body", async () => {
  await conProviderMock(async () => new Response("private provider details", { status: 429 }), async () => {
    await assert.rejects(
      callGroqText({ systemPrompt: "", userPrompt: "hello" }),
      (error) => error.status === 429 && error.message === "Errore Groq (HTTP 429)."
    );
  });
});

async function conParacaduteOpenRouter(handler, run) {
  const originali = {
    fetch: globalThis.fetch,
    groq: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL,
    openrouter: process.env.OPENROUTER_API_KEY,
    openrouterModel: process.env.OPENROUTER_CHAT_MODEL,
  };
  process.env.GROQ_API_KEY = "test-groq-key";
  delete process.env.GROQ_MODEL;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.OPENROUTER_CHAT_MODEL;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = originali.fetch;
    for (const [chiave, valore] of [
      ["GROQ_API_KEY", originali.groq],
      ["GROQ_MODEL", originali.groqModel],
      ["OPENROUTER_API_KEY", originali.openrouter],
      ["OPENROUTER_CHAT_MODEL", originali.openrouterModel],
    ]) {
      if (valore === undefined) delete process.env[chiave];
      else process.env[chiave] = valore;
    }
  }
}

const rispostaTesto = (contenuto) => new Response(JSON.stringify({
  choices: [{ message: { content: contenuto } }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

test("Groq 5xx ripete la richiesta su OpenRouter con modello e token compatibili", async () => {
  const chiamate = [];
  await conParacaduteOpenRouter(async (url, options) => {
    chiamate.push(String(url));
    if (String(url).includes("api.groq.com")) {
      return new Response("provider interno", { status: 500 });
    }
    assert.equal(options.headers.Authorization, "Bearer test-openrouter-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "openai/gpt-oss-120b");
    assert.equal(body.reasoning_format, undefined);
    assert.equal(body.max_completion_tokens, undefined);
    assert.ok(body.max_tokens >= 700);
    assert.deepEqual(body.response_format, { type: "json_object" });
    return rispostaTesto('{"route":"territorio"}');
  }, async () => {
    const result = await callGroqText({
      systemPrompt: "system",
      userPrompt: "storia di Civita",
      json: true,
      maxTokens: 400,
    });
    assert.equal(result, '{"route":"territorio"}');
    assert.deepEqual(chiamate, [
      "https://api.groq.com/openai/v1/chat/completions",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
  });
});

test("Groq 429 con paracadute caduto restituisce l'errore originale di Groq", async () => {
  await conParacaduteOpenRouter(async () => new Response("non disponibile", { status: 429 }), async () => {
    await assert.rejects(
      callGroqText({ systemPrompt: "", userPrompt: "hello" }),
      (error) => error.status === 429 && error.message === "Errore Groq (HTTP 429)."
    );
  });
});

test("Un 400 di merito non attiva il paracadute OpenRouter", async () => {
  const chiamate = [];
  await conParacaduteOpenRouter(async (url) => {
    chiamate.push(String(url));
    return new Response("richiesta non valida", { status: 400 });
  }, async () => {
    await assert.rejects(
      callGroqText({ systemPrompt: "", userPrompt: "hello" }),
      (error) => error.status === 400
    );
    assert.deepEqual(chiamate, ["https://api.groq.com/openai/v1/chat/completions"]);
  });
});

test("Groq provider fails clearly when the API key is missing", async () => {
  const keyOriginal = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    await assert.rejects(
      callGroqText({ systemPrompt: "", userPrompt: "hello" }),
      /GROQ_API_KEY/
    );
  } finally {
    if (keyOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = keyOriginal;
  }
});
