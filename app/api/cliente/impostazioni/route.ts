import { NextResponse } from "next/server";

/**
 * API Impostazioni — Area Clienti.
 * Fase 1 — architettura: struttura predisposta, nessuna logica.
 * Verrà collegata ai servizi lib/cliente nelle fasi successive.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Modulo non ancora implementato." },
    { status: 501 }
  );
}
