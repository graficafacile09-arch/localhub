import { NextResponse } from "next/server";
import { search } from "@/lib/search-service";
import { checkRateLimit } from "@/lib/rate-limiter";

// Endpoint pubblico: limiti conservativi condivisi (contatore DB su scan_log).
const MAX_PER_MINUTO = 20;
const MAX_PER_ORA = 120;

function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

export async function POST(request: Request) {
  // Rate limit CONDIVISO per IP: contatore su scan_log (condiviso tra
  // istanze serverless), prima di qualunque lavoro. Stessa soglia/risposta
  // 429 degli altri endpoint pubblici (es. /api/assistente).
  const rateCheck = await checkRateLimit(`ricerca-ai:${ipRichiedente(request)}`, {
    perMinute: MAX_PER_MINUTO,
    perHour: MAX_PER_ORA,
    reasonLabel: "ricerche",
    useSharedCounter: true,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Troppe richieste in poco tempo. Riprova tra qualche minuto." },
      { status: 429 }
    );
  }

  try {
    const { query } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "La query è vuota." }, { status: 400 });
    }

    const result = await search(query);

    return NextResponse.json({
      risposta: result.risposta ?? "",
      negozi: result.negozi,
      prodotti: result.prodotti,
    });
  } catch (error: unknown) {
    console.error("ERRORE CRITICO NELL'API:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Si è verificato un errore interno.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
