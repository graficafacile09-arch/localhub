import { NextResponse } from "next/server";
import sharp from "sharp";
import { extractSuggestion } from "@/lib/product-assistant/providers/utils";
import { buildVisionPrompt } from "@/lib/product-assistant/prompts";

const LOW_CONFIDENCE_THRESHOLD = 60;
const MAX_TOKENS = 300;
const JPEG_QUALITY = 80;

const CROP_SIZE = 640;
const NO_CROP_MAX_DIM = 1024;

const MODELS: Record<string, string> = {
  gemma: "@cf/google/gemma-4-26b-a4b-it",
  moondream: "@cf/moondream/moondream3.1-9B-A2B",
};

async function callChatCompletions(accountId: string, apiToken: string, model: string, prompt: string, imageBase64: string, mime: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
        ],
      },
    ],
    max_completion_tokens: MAX_TOKENS,
    temperature: 0.1,
    chat_template_kwargs: { enable_thinking: false },
  });

  const tStart = performance.now();
  const bodySize = new Blob([body]).size;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body,
  });
  const tHeaders = performance.now();
  const status = response.status;
  const rawBody = await response.text();
  const tBody = performance.now();

  return { status, rawBody, bodySize, latencyHeaders: tHeaders - tStart, latencyBody: tBody - tHeaders, tBody };
}

async function callMoondream(accountId: string, apiToken: string, prompt: string, imageBase64: string, mime: string) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/moondream/moondream3.1-9B-A2B`;

  const body = JSON.stringify({
    task: "query",
    image: `data:${mime};base64,${imageBase64}`,
    question: prompt,
    max_tokens: MAX_TOKENS,
    temperature: 0.1,
    reasoning: false,
  });

  const tStart = performance.now();
  const bodySize = new Blob([body]).size;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body,
  });
  const tHeaders = performance.now();
  const status = response.status;
  const rawBody = await response.text();
  const tBody = performance.now();

  return { status, rawBody, bodySize, latencyHeaders: tHeaders - tStart, latencyBody: tBody - tHeaders, tBody };
}

export async function POST(request: Request) {
  const tStart = performance.now();
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json(
        { success: false, error: { code: "CLOUDFLARE_NOT_CONFIGURED", message: "Cloudflare non configurato." } },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelKey = searchParams.get("model") ?? "gemma";
    const modelId = MODELS[modelKey];
    if (!modelId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_MODEL", message: `Modello sconosciuto: ${modelKey}. Usa: ${Object.keys(MODELS).join(", ")}.` } },
        { status: 400 }
      );
    }

    const tRecv = performance.now();
    const formData = await request.formData();
    const file = formData.get("image");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_BODY", message: "Immagine mancante o non valida." } },
        { status: 422 }
      );
    }

    const bufRaw = Buffer.from(await file.arrayBuffer());
    const mime = "image/jpeg";
    const tPrep = performance.now();

    const cropEnabled = searchParams.get("crop") === "1";
    let bufProcessed: Buffer;
    let processedW = 0;
    let processedH = 0;

    if (cropEnabled) {
      const result = await sharp(bufRaw)
        .resize(CROP_SIZE, CROP_SIZE, {
          fit: "cover",
          position: "attention",
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer({ resolveWithObject: true });
      bufProcessed = result.data;
      processedW = result.info.width;
      processedH = result.info.height;
    } else {
      const result = await sharp(bufRaw)
        .resize(NO_CROP_MAX_DIM, NO_CROP_MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer({ resolveWithObject: true });
      bufProcessed = result.data;
      processedW = result.info.width;
      processedH = result.info.height;
    }
    const tResizeEnd = performance.now();

    const base64 = bufProcessed.toString("base64");
    const tB64End = performance.now();

    const prompt = buildVisionPrompt();

    let responseData: {
      status: number;
      rawBody: string;
      bodySize: number;
      latencyHeaders: number;
      latencyBody: number;
      tBody: number;
    };

    if (modelKey === "moondream") {
      responseData = await callMoondream(accountId, apiToken, prompt, base64, mime);
    } else {
      responseData = await callChatCompletions(accountId, apiToken, modelId, prompt, base64, mime);
    }

    const { status, rawBody, bodySize, latencyHeaders, latencyBody, tBody } = responseData;
    const tCfHeaders = tPrep + latencyHeaders;
    const tCfBody = tBody;

    if (!responseData || rawBody === undefined) {
      return NextResponse.json(
        { success: false, error: { code: "AI_PROVIDER_ERROR", message: `Errore interno: responseData non valido.` } },
        { status: 500 }
      );
    }

    if (status !== 200) {
      if (status === 429) {
        return NextResponse.json(
          { success: false, error: { code: "AI_PROVIDER_QUOTA_EXCEEDED", message: `Cloudflare (${modelKey}): quota esaurita HTTP 429.` } },
          { status }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare (${modelKey}): HTTP ${status}. Body: ${rawBody.slice(0, 500)}`,
          },
        },
        { status }
      );
    }

    if (!rawBody.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare (${modelKey}): body vuoto. HTTP ${status}.`,
          },
        },
        { status: 502 }
      );
    }

    const tParseStart = performance.now();

    let responseJson: {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      answer?: string;
      error?: { message?: string };
    };
    try {
      responseJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare (${modelKey}): risposta JSON non valida. HTTP ${status}, body (primi 500): ${rawBody.slice(0, 500)}.`,
          },
        },
        { status: 502 }
      );
    }

    if (responseJson.error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare (${modelKey}): ${responseJson.error.message ?? "Errore sconosciuto"}`,
          },
        },
        { status: 502 }
      );
    }

    let content: string;
    let finishReason: string;
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    if (modelKey === "moondream") {
      content = responseJson.answer ?? "";
      finishReason = content ? "stop" : "unknown";
      usage = undefined;
    } else {
      finishReason = responseJson.choices?.[0]?.finish_reason ?? "unknown";
      usage = responseJson.usage;
      content = (responseJson.choices?.[0]?.message?.content ?? "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare (${modelKey}): risposta vuota. finish_reason: ${finishReason}.`,
          },
        },
        { status: 502 }
      );
    }

    const jsonStr = (() => {
      const trimmed = content.trim();
      try { JSON.parse(trimmed); return trimmed; } catch { /* fall through */ }
      const braceStart = trimmed.indexOf("{");
      const braceEnd = trimmed.lastIndexOf("}");
      if (braceStart !== -1 && braceEnd > braceStart) return trimmed.slice(braceStart, braceEnd + 1);
      return trimmed;
    })();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "AI_PROVIDER_ERROR", message: `Cloudflare (${modelKey}): impossibile parsare JSON dalla risposta: ${content.slice(0, 300)}` } },
        { status: 502 }
      );
    }
    const tParseEnd = performance.now();

    const suggestion = extractSuggestion(parsed);
    const tDone = performance.now();

    const tTotal = Math.round(tDone - tStart);

    console.log("=== PROFILING VERCELL ===");
    console.log(`Modello: ${modelId}`);
    console.log(`Crop: ${cropEnabled ? "si (attention 640x640)" : "no (1024 max)"}`);
    console.log(`5. Ricezione richiesta su Vercel: ${Math.round(tPrep - tRecv)}ms (formData + arrayBuffer)`);
    console.log(`   Dimensione upload ricevuto: ${(bufRaw.length / 1024).toFixed(1)} KB`);
    console.log(`6a. Elaborazione immagine (sharp): ${Math.round(tResizeEnd - tPrep)}ms`);
    console.log(`   Dopo sharp: ${(bufProcessed.length / 1024).toFixed(1)} KB (${processedW}x${processedH})`);
    console.log(`6b. Base64: ${Math.round(tB64End - tResizeEnd)}ms`);
    console.log(`   Body inviato a Cloudflare: ${(bodySize / 1024).toFixed(1)} KB`);
    console.log(`7a. Invio richiesta -> primi header Cloudflare: ${Math.round(latencyHeaders)}ms`);
    console.log(`7b. Download body risposta Cloudflare: ${Math.round(latencyBody)}ms`);
    console.log(`   Dimensione risposta Cloudflare: ${(rawBody.length / 1024).toFixed(1)} KB`);
    console.log(`9a. Parsing JSON risposta: ${Math.round(tParseEnd - tParseStart)}ms`);
    console.log(`9b. Estrazione suggestion: ${Math.round(tDone - tParseEnd)}ms`);
    console.log(`TOTALE server: ${tTotal}ms`);
    if (usage) {
      console.log(`--- Metriche modello ---`);
      console.log(`prompt_tokens: ${usage.prompt_tokens ?? "N/A"}`);
      console.log(`completion_tokens: ${usage.completion_tokens ?? "N/A"}`);
      console.log(`total_tokens: ${usage.total_tokens ?? "N/A"}`);
    }
    console.log(`finish_reason: ${finishReason}`);

    return NextResponse.json({
      success: true,
      suggestion,
      lowConfidence: suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
    });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Errore sconosciuto.";
    return NextResponse.json(
      { success: false, error: { code: "VISION_FAILED", message } },
      { status: 500 }
    );
  }
}
