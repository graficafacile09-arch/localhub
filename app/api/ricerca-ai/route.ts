import { NextResponse } from "next/server";
import { ricercaConAi } from "@/lib/ricerca-ai";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: "La query è vuota." }, { status: 400 });
    }

    const risultato = await ricercaConAi(query);
    return NextResponse.json(risultato);
  } catch (error: unknown) {
    console.error("ERRORE CRITICO NELL'API:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Si è verificato un errore interno.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
