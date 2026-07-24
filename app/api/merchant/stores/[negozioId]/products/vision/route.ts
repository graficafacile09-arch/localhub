import { NextResponse } from "next/server";
import { extractSuggestion } from "@/lib/product-assistant/providers/utils";
import { buildVisionPrompt } from "@/lib/product-assistant/prompts";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const LOW_CONFIDENCE_THRESHOLD = 60;

export async function POST(request: Request) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json(
        { success: false, error: { code: "CLOUDFLARE_NOT_CONFIGURED", message: "Cloudflare non configurato." } },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_BODY", message: "Immagine mancante o non valida." } },
        { status: 422 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file instanceof File ? file.name : "product-image.jpg";
    const ext = filename.toLowerCase().split(".").pop() ?? "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const base64 = buffer.toString("base64");

    console.log("=== DIAGNOSTICA RICHIESTA ===");
    console.log("MIME:", mime);
    console.log("Buffer dimensione:", buffer.length, "bytes");
    console.log("Base64 lunghezza:", base64.length, "chars");
    console.log("Prompt:", buildVisionPrompt());

    const requestBody = {
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildVisionPrompt() },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 3072,
      temperature: 0.1,
    };

    const bodyForLog = JSON.parse(JSON.stringify(requestBody));
    bodyForLog.messages[0].content[1].image_url.url = `data:${mime};base64,... (${base64.length} chars)`;
    console.log("REQUEST BODY (senza base64):", JSON.stringify(bodyForLog, null, 2));

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

    const cfResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const status = cfResponse.status;
    const headersSnapshot: Record<string, string> = {};
    cfResponse.headers.forEach((v, k) => { headersSnapshot[k] = v; });

    const rawBody = await cfResponse.text();

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
      console.log("=== BODY VUOTO ===");
      console.log("HTTP", status, "Headers:", JSON.stringify(headersSnapshot));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare: body vuoto. HTTP ${status}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, Transfer-Encoding: ${headersSnapshot["transfer-encoding"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
          },
        },
        { status: 502 }
      );
    }

    let responseJson: { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    try {
      responseJson = JSON.parse(rawBody);
    } catch {
      console.log("=== JSON NON VALIDO ===");
      console.log("HTTP", status, "rawBody (primi 500):", rawBody.slice(0, 500));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare: risposta JSON non valida. HTTP ${status}, body (primi 500): ${rawBody.slice(0, 500)}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
          },
        },
        { status: 502 }
      );
    }

    console.log("=== RISPOSTA COMPLETA ===");
    console.log("choices[0]:", JSON.stringify(responseJson.choices?.[0], null, 2));
    console.log("usage:", JSON.stringify(responseJson.usage, null, 2));

    const content = (responseJson.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (!content) {
      const finishReason = responseJson.choices?.[0]?.finish_reason ?? "unknown";
      console.log("=== CONTENUTO VUOTO ===");
      console.log("HTTP", status, "finish_reason:", finishReason);
      console.log("choices[0] completo:", JSON.stringify(responseJson.choices?.[0], null, 2));
      console.log("usage:", JSON.stringify(responseJson.usage, null, 2));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_PROVIDER_ERROR",
            message: `Cloudflare: risposta vuota. HTTP ${status}, finish_reason: ${finishReason}, body (primi 500): ${rawBody.slice(0, 500)}, Content-Length: ${headersSnapshot["content-length"] ?? "N/A"}, Transfer-Encoding: ${headersSnapshot["transfer-encoding"] ?? "N/A"}, headers: ${JSON.stringify(headersSnapshot)}.`,
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

    const suggestion = extractSuggestion(parsed);

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
