import { NextResponse } from "next/server";
import sharp from "sharp";
import { extractSuggestion } from "@/lib/product-assistant/providers/utils";
import { buildVisionPrompt } from "@/lib/product-assistant/prompts";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const LOW_CONFIDENCE_THRESHOLD = 60;
const MAX_TOKENS = 300;
const MAX_IMAGE_DIM = 1024;
const JPEG_QUALITY = 80;

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

    const bufResized = await sharp(bufRaw)
      .resize(MAX_IMAGE_DIM, MAX_IMAGE_DIM, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    const tResizeEnd = performance.now();

    const base64 = bufResized.toString("base64");
    const tB64End = performance.now();

    const prompt = buildVisionPrompt();
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

    const body = JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      max_completion_tokens: MAX_TOKENS,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false },
    });

    const tCfStart = performance.now();
    const cfResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    const tCfEnd = performance.now();

    const status = cfResponse.status;
    const headersSnapshot: Record<string, string> = {};
    cfResponse.headers.forEach((v, k) => { headersSnapshot[k] = v; });

    const rawBody = await cfResponse.text();
    const tRecvResp = performance.now();

    if (!cfResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: status === 429 ? "AI_PROVIDER_QUOTA_EXCEEDED" : "AI_PROVIDER_ERROR",
            message: `Cloudflare: HTTP ${status}.`,
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
            message: `Cloudflare: body vuoto. HTTP ${status}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
          },
        },
        { status: 502 }
      );
    }

    let responseJson: {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    try {
      responseJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare: risposta JSON non valida. HTTP ${status}, body (primi 500): ${rawBody.slice(0, 500)}.`,
          },
        },
        { status: 502 }
      );
    }
    const tParseEnd = performance.now();

    const finishReason = responseJson.choices?.[0]?.finish_reason ?? "unknown";
    const usage = responseJson.usage;

    const content = (responseJson.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (!content) {
      if (finishReason === "length") {
        console.log("Il modello ha esaurito i token prima di produrre message.content.");
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare: risposta vuota. finish_reason: ${finishReason}, prompt_tokens: ${usage?.prompt_tokens ?? "?"}, completion_tokens: ${usage?.completion_tokens ?? "?"}, total_tokens: ${usage?.total_tokens ?? "?"}.`,
          },
        },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "AI_PROVIDER_ERROR", message: "Cloudflare: impossibile parsare la risposta del modello." } },
        { status: 502 }
      );
    }
    const tExtract = performance.now();

    const suggestion = extractSuggestion(parsed);
    const tDone = performance.now();

    const tTotal = Math.round(tDone - tStart);

    console.log("=== PROFILING VERCELL ===");
    console.log(`5. Ricezione richiesta su Vercel: ${Math.round(tPrep - tRecv)}ms (formData + arrayBuffer)`);
    console.log(`6a. Ridimensionamento immagine (sharp): ${Math.round(tResizeEnd - tPrep)}ms`);
    console.log(`6b. Base64: ${Math.round(tB64End - tResizeEnd)}ms`);
    console.log(`7. Invio Vercel -> Cloudflare (fetch + attesa AI): ${Math.round(tCfEnd - tCfStart)}ms`);
    console.log(`8. Download risposta Cloudflare: ${Math.round(tRecvResp - tCfEnd)}ms`);
    console.log(`9a. Parsing JSON risposta: ${Math.round(tParseEnd - tRecvResp)}ms`);
    console.log(`9b. Estrazione suggestion: ${Math.round(tDone - tExtract)}ms`);
    console.log(`TOTALE server: ${tTotal}ms`);
    console.log(`--- Metriche modello ---`);
    console.log(`prompt_tokens: ${usage?.prompt_tokens ?? "N/A"}`);
    console.log(`completion_tokens: ${usage?.completion_tokens ?? "N/A"}`);
    console.log(`total_tokens: ${usage?.total_tokens ?? "N/A"}`);
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
