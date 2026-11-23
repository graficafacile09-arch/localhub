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
    assert.ok(body.max_tokens >= 700);
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
    assert.equal(body.tool_choice, "auto");
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
