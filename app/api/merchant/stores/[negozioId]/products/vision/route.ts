import { NextResponse } from "next/server";
import sharp from "sharp";
import { extractSuggestion } from "@/lib/product-assistant/providers/utils";
import { buildVisionPrompt } from "@/lib/product-assistant/prompts";
import { checkImageCache, storeInCache } from "@/lib/product-assistant/vision-cache";
import { callGeminiGeneration } from "@/lib/product-assistant/providers/gemini";
import { getCurrentUser } from "@/lib/auth/session";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logScan } from "@/lib/scan-log";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const tStart = performance.now();
  try {
    const { negozioId } = await context.params;

    // ── Autenticazione + area di sessione ─────────────────────────────────
    const { sessione, error } = await requireApiArea("merchant");
    if (error) return error;
    const user = sessione.user;

    // ── Proprietà del negozio (merchant o admin autorizzato) ─────────────
    if (!(await canManageStore(user.id, negozioId))) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Non puoi gestire questo negozio." } },
        { status: 403 }
      );
    }

    // ── Rate limiting ───────────────────────────────────────────────────────
    const rateCheck = await checkRateLimit(user.id);
    if (!rateCheck.allowed) {
      await logScan({
        userId: user.id,
        negozioId,
        provider: "rate_limiter",
        responseTimeMs: Math.round(performance.now() - tStart),
        cacheHit: false,
        status: "rate_limited",
        errorCode: "RATE_LIMITED",
        errorMessage: rateCheck.reason,
      });
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: rateCheck.reason } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelKey = searchParams.get("model") ?? "gemma";
    const VALID_KEYS = [...Object.keys(MODELS), "gemini"];
    if (!VALID_KEYS.includes(modelKey)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_MODEL", message: `Modello sconosciuto: ${modelKey}. Usa: ${VALID_KEYS.join(", ")}.` } },
        { status: 400 }
      );
    }
    const modelId = MODELS[modelKey];
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (modelKey !== "gemini" && (!accountId || !apiToken)) {
      logScan({
        userId: user.id,
        negozioId,
        provider: `Cloudflare (${modelKey})`,
        responseTimeMs: Math.round(performance.now() - tStart),
        cacheHit: false,
        status: "error",
        errorCode: "CLOUDFLARE_NOT_CONFIGURED",
        errorMessage: "Cloudflare non configurato.",
      });
      return NextResponse.json(
        { success: false, error: { code: "CLOUDFLARE_NOT_CONFIGURED", message: "Cloudflare non configurato." } },
        { status: 500 }
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

    const tCacheStart = performance.now();
    const cached = await checkImageCache(bufProcessed);

    if (cached.hit) {
      const tCacheEnd = performance.now();
      const suggestion: Parameters<typeof extractSuggestion>[0] =
        cached.entry.full_suggestion ?? {
          nome: cached.entry.product_name,
          marca: cached.entry.brand,
          categoria: cached.entry.category,
          codiceEan: cached.entry.ean,
          prezzoSuggerito: cached.entry.suggested_price,
          descrizione: cached.entry.description,
          confidenza: cached.entry.confidence,
        };

      const res = extractSuggestion(suggestion);

      logScan({
        userId: user.id,
        negozioId,
        provider: "cache",
        responseTimeMs: Math.round(tCacheEnd - tStart),
        confidence: res.confidenza,
        cacheHit: true,
        imageHash: cached.entry.image_hash,
        modelUsed: cached.entry.model_used,
        status: "success",
      });

      return NextResponse.json({
        success: true,
        suggestion: res,
        lowConfidence: res.confidenza < LOW_CONFIDENCE_THRESHOLD,
        cached: true,
        tempiFasi: {
          upload: Math.round(tRecv - tStart),
          preprocessing: Math.round(tCacheEnd - tPrep),
          cacheLookup: Math.round(tCacheEnd - tCacheStart),
          totale: Math.round(tCacheEnd - tStart),
        },
      });
    }

    const tCacheEnd = performance.now();
    const prompt = buildVisionPrompt();

    let responseData: {
      status: number;
      rawBody: string;
      bodySize: number;
      latencyHeaders: number;
      latencyBody: number;
      tBody: number;
    };

    if (modelKey === "gemini") {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      if (!geminiApiKey) {
        logScan({
          userId: user.id,
          negozioId,
          provider: "Gemini",
          responseTimeMs: Math.round(performance.now() - tStart),
          cacheHit: false,
          status: "error",
          errorCode: "GEMINI_NOT_CONFIGURED",
          errorMessage: "Gemini API key non configurata.",
        });
        return NextResponse.json(
          { success: false, error: { code: "GEMINI_NOT_CONFIGURED", message: "Gemini API key non configurata." } },
          { status: 500 }
        );
      }
      responseData = await callGeminiGeneration(geminiApiKey, geminiModel, prompt, base64, mime);
    } else if (modelKey === "moondream") {
      responseData = await callMoondream(accountId!, apiToken!, prompt, base64, mime);
    } else {
      responseData = await callChatCompletions(accountId!, apiToken!, modelId, prompt, base64, mime);
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
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      if (status === 429) {
        logScan({
          userId: user.id,
          negozioId,
          provider,
          responseTimeMs: Math.round(performance.now() - tStart),
          cacheHit: false,
          status: "error",
          errorCode: "AI_PROVIDER_QUOTA_EXCEEDED",
          errorMessage: `${provider}: quota esaurita HTTP 429.`,
        });
        return NextResponse.json(
          { success: false, error: { code: "AI_PROVIDER_QUOTA_EXCEEDED", message: `${provider}: quota esaurita HTTP 429.` } },
          { status }
        );
      }
      logScan({
        userId: user.id,
        negozioId,
        provider,
        responseTimeMs: Math.round(performance.now() - tStart),
        cacheHit: false,
        status: "error",
        errorCode: "AI_PROVIDER_ERROR",
        errorMessage: `${provider}: HTTP ${status}.`,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `${provider}: HTTP ${status}. Body: ${rawBody.slice(0, 500)}`,
          },
        },
        { status }
      );
    }

    if (!rawBody.trim()) {
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `${provider}: body vuoto. HTTP ${status}.`,
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
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };
    try {
      responseJson = JSON.parse(rawBody);
    } catch {
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `${provider}: risposta JSON non valida. HTTP ${status}, body (primi 500): ${rawBody.slice(0, 500)}.`,
          },
        },
        { status: 502 }
      );
    }

    if (responseJson.error) {
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `${provider}: ${responseJson.error.message ?? "Errore sconosciuto"}`,
          },
        },
        { status: 502 }
      );
    }

    let content: string;
    let finishReason: string;
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    if (modelKey === "gemini") {
      const candidate = responseJson.candidates?.[0];
      content = candidate?.content?.parts?.[0]?.text ?? "";
      finishReason = candidate?.finishReason ?? "unknown";
      usage = responseJson.usageMetadata
        ? {
            prompt_tokens: responseJson.usageMetadata.promptTokenCount,
            completion_tokens: responseJson.usageMetadata.candidatesTokenCount,
            total_tokens: responseJson.usageMetadata.totalTokenCount,
          }
        : undefined;
    } else if (modelKey === "moondream") {
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
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `${provider}: risposta vuota. finish_reason: ${finishReason}.`,
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
      const provider = modelKey === "gemini" ? "Gemini" : `Cloudflare (${modelKey})`;
      return NextResponse.json(
        { success: false, error: { code: "AI_PROVIDER_ERROR", message: `${provider}: impossibile parsare JSON dalla risposta: ${content.slice(0, 300)}` } },
        { status: 502 }
      );
    }
    const tParseEnd = performance.now();

    const suggestion = extractSuggestion(parsed);
    const cacheModel = modelKey === "gemini" ? "gemini-1.5-flash" : modelId;
    storeInCache(bufProcessed, suggestion, cacheModel).catch(() => {});
    const tDone = performance.now();

    const tTotal = Math.round(tDone - tStart);

    const providerName = modelKey === "gemini" ? "Gemini" : modelKey === "moondream" ? "Moondream" : "Cloudflare";
    const totalTokens = usage?.total_tokens ?? undefined;

    const tempiFasi = {
      upload: Math.round(tRecv - tStart),
      preprocessing: Math.round(tPrep - tRecv),
      sharpResize: Math.round(tResizeEnd - tPrep),
      base64: Math.round(tB64End - tResizeEnd),
      cacheLookup: Math.round(tCacheEnd - tCacheStart),
      fase7A: Math.round(latencyHeaders),
      fase7B: Math.round(latencyBody),
      parseRisposta: Math.round(tParseEnd - tParseStart),
      estrazioneSuggestion: Math.round(tDone - tParseEnd),
      totale: Math.round(tDone - tStart),
    };

    logScan({
      userId: user.id,
      negozioId,
      provider: providerName,
      responseTimeMs: tTotal,
      confidence: suggestion.confidenza,
      cacheHit: false,
      imageHash: undefined,
      modelUsed: modelKey === "gemini" ? process.env.GEMINI_MODEL || "gemini-2.0-flash" : modelId ?? undefined,
      totalTokens,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      suggestion,
      lowConfidence: suggestion.confidenza < LOW_CONFIDENCE_THRESHOLD,
      tempiFasi,
    });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Errore sconosciuto.";
    const userInfo = await getCurrentUser().catch(() => null);

    logScan({
      userId: userInfo?.id ?? "unknown",
      negozioId: undefined,
      provider: "unknown",
      responseTimeMs: Math.round(performance.now() - tStart),
      cacheHit: false,
      status: "error",
      errorCode: "VISION_FAILED",
      errorMessage: message,
    });

    return NextResponse.json(
      { success: false, error: { code: "VISION_FAILED", message } },
      { status: 500 }
    );
  }
}
