import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";

const CLOUDFLARE_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);

  function log(...args: unknown[]) {
    console.log(`[VisionAPI:${requestId}]`, ...args);
  }

  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    log(`CLOUDFLARE_ACCOUNT_ID presente=${Boolean(accountId)}`);
    log(`CLOUDFLARE_API_TOKEN presente=${Boolean(apiToken)}`);

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { success: false, error: "CLOUDFLARE_NOT_CONFIGURED", message: "Cloudflare non configurato." },
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Autenticazione ────────────────────────────────────────────────────────
    log("Autenticazione in corso...");
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED", message: "Devi effettuare l'accesso." },
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    log(`Utente autenticato: ${user.id}`);

    // ── Verifica proprietà negozio ────────────────────────────────────────────
    log("Verifica negozio in corso...");
    const { negozioId } = await context.params;
    log(`Negozio ID: ${negozioId}`);

    const storeResult = await getMerchantStoreForUser(user.id, negozioId);

    if (storeResult.setupRequired) {
      return NextResponse.json(
        { success: false, error: "SETUP_REQUIRED", message: storeResult.errorMessage ?? "Configurazione database non completata." },
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!storeResult.data) {
      return NextResponse.json(
        { success: false, error: "FORBIDDEN", message: "Non puoi gestire questo negozio." },
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    log(`Negozio verificato: ${storeResult.data.nome}`);

    // ── Ricezione immagine ───────────────────────────────────────────────────
    log("Lettura FormData in corso...");
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "INVALID_BODY", message: "Immagine mancante o non valida." },
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    log(`File ricevuto: name=${file instanceof File ? file.name : "unknown"}, size=${file.size} bytes`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file instanceof File ? file.name : "product-image.jpg";
    log(`Buffer creato: ${buffer.length} bytes`);

    const mimeType = filename.toLowerCase().endsWith(".png")
      ? "image/png"
      : filename.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
    const base64 = buffer.toString("base64");

    const systemPrompt = `Sei un assistente specializzato nell'analisi di prodotti per e-commerce.
Analizza l'immagine del prodotto e restituisci SOLO un JSON valido, senza testo aggiuntivo.
Il JSON deve avere questa struttura:
{
  "nome": "nome prodotto in italiano",
  "categoria": "categoria prodotto",
  "descrizione": "breve descrizione",
  "prezzo_suggerito": prezzo in numero,
  "parole_chiave": ["parola1", "parola2"],
  "confidenza": percentuale 0-100
}`;

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;

    log(`URL chiamata: ${url}`);

    const body = JSON.stringify({
      model: CLOUDFLARE_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    log(`Body inviato (model, max_tokens, temperatura): ${JSON.stringify({ model: CLOUDFLARE_MODEL, max_tokens: 2000, temperature: 0.1 })}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const status = response.status;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      responseHeaders[key] = value;
    });
    const responseBody = await response.text().catch(() => "unknown");

    log(`STATUS: ${status}`);
    log(`HEADERS: ${JSON.stringify(responseHeaders)}`);
    log(`BODY: ${responseBody}`);

    return NextResponse.json(
      {
        success: response.ok,
        provider: "cloudflare",
        model: CLOUDFLARE_MODEL,
        status,
        url,
        headers: responseHeaders,
        body: responseBody,
        message: response.ok ? "OK" : `Cloudflare ha risposto con HTTP ${status}`,
      },
      { status: response.ok ? 200 : status, headers: { "Content-Type": "application/json" } }
    );
  } catch (caught: unknown) {
    const elapsed = Date.now() - startTime;
    const message = caught instanceof Error ? caught.message : "Errore sconosciuto.";
    const stack = caught instanceof Error ? caught.stack : undefined;

    log(`EXCEPTION dopo ${elapsed}ms: ${message}`);
    if (stack) log(stack);

    return NextResponse.json(
      {
        success: false,
        provider: "cloudflare",
        status: "exception",
        message,
        stack: stack ?? undefined,
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
