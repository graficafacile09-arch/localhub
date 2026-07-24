import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { analyzeImages } from "@/lib/product-assistant/vision";
import type { VisionImage } from "@/lib/product-assistant/vision";

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);

  function log(...args: unknown[]) {
    console.log(`[VisionAPI:${requestId}]`, ...args);
  }

  function error(code: string, message: string, status: number) {
    log(`ERR ${code} — ${message}`);
    return NextResponse.json(
      { success: false, error: { code, message } },
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // ── Autenticazione ────────────────────────────────────────────────────────
    log("Autenticazione in corso...");
    const user = await getCurrentUser();

    if (!user) {
      return error("UNAUTHORIZED", "Devi effettuare l'accesso.", 401);
    }

    log(`Utente autenticato: ${user.id}`);

    // ── Verifica proprietà negozio ────────────────────────────────────────────
    log("Verifica negozio in corso...");
    const { negozioId } = await context.params;
    log(`Negozio ID: ${negozioId}`);

    const storeResult = await getMerchantStoreForUser(user.id, negozioId);

    if (storeResult.setupRequired) {
      return error(
        "SETUP_REQUIRED",
        storeResult.errorMessage ?? "Configurazione database non completata.",
        503
      );
    }

    if (!storeResult.data) {
      return error("FORBIDDEN", "Non puoi gestire questo negozio.", 403);
    }

    log(`Negozio verificato: ${storeResult.data.nome}`);

    // ── Ricezione immagine ───────────────────────────────────────────────────
    log("Lettura FormData in corso...");
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof Blob)) {
      return error("INVALID_BODY", "Immagine mancante o non valida.", 422);
    }

    log(`File ricevuto: name=${file instanceof File ? file.name : "unknown"}, size=${file.size} bytes`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file instanceof File ? file.name : "product-image.jpg";

    log(`Buffer creato: ${buffer.length} bytes`);

    // ── Analisi AI ───────────────────────────────────────────────────────────
    const images: VisionImage[] = [
      { buffer, filename, role: "primary" },
    ];

    const visionContext = {
      negozioNome: storeResult.data.nome,
      negozioCategoria: storeResult.data.categoria ?? undefined,
    };

    log("Chiamata analyzeImages in corso...");
    const result = await analyzeImages(images, visionContext);
    log(`analyzeImages completato: success=${result.success}`);

    if (!result.success) {
      return error("VISION_DISABLED", result.message, 503);
    }

    log(`Suggerimento ottenuto: "${result.suggestion.nome}" (confidenza: ${result.suggestion.confidenza}%)`);
    log(`Tempo totale: ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      suggestion: result.suggestion,
      lowConfidence: result.lowConfidence,
    });
  } catch (caught: unknown) {
    const elapsed = Date.now() - startTime;
    const message =
      caught instanceof Error ? caught.message : "Errore sconosciuto.";
    const stack = caught instanceof Error ? caught.stack : undefined;

    log(`EXCEPTION dopo ${elapsed}ms: ${message}`);
    if (stack) log(stack);

    // Se Next.js ha già normalizzato in HTML, garantiamo JSON
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VISION_FAILED",
          message: message || "Errore interno durante l'analisi AI.",
        },
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
