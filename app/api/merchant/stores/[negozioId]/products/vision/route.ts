import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import { analyzeImages } from "@/lib/product-assistant/vision";
import type { VisionImage } from "@/lib/product-assistant/vision";

export async function POST(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  // ── Autenticazione ──────────────────────────────────────────────────────────
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Devi effettuare l'accesso." } },
      { status: 401 }
    );
  }

  // ── Verifica membership negozio ────────────────────────────────────────────
  const { negozioId } = await context.params;
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);

  if (storeResult.setupRequired) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SETUP_REQUIRED",
          message: storeResult.errorMessage ?? "Merchant Foundation non configurata.",
        },
      },
      { status: 503 }
    );
  }

  if (!storeResult.data) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Non puoi gestire questo negozio." } },
      { status: 403 }
    );
  }

  // ── Ricezione immagine ─────────────────────────────────────────────────────
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

  // ── Analisi AI ─────────────────────────────────────────────────────────────
  const images: VisionImage[] = [
    { buffer, filename, role: "primary" },
  ];

  const visionContext = {
    negozioNome: storeResult.data.nome,
    negozioCategoria: storeResult.data.categoria ?? undefined,
  };

  try {
    const { suggestion, lowConfidence } = await analyzeImages(images, visionContext);

    return NextResponse.json({
      success: true,
      suggestion,
      lowConfidence,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Errore interno durante l'analisi AI.";

    return NextResponse.json(
      { success: false, error: { code: "VISION_FAILED", message } },
      { status: 500 }
    );
  }
}
