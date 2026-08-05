import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaProfilo, getProfilo } from "@/lib/cliente/profile";
import type { ClienteProfilo } from "@/lib/cliente/types";

const CAP_RE = /^\d{5}$/;
const PHONE_MAX = 30;
const PROVINCIA_RE = /^[A-Za-z]{2}$/;

function valida(body: Record<string, unknown>): string | null {
  if (typeof body.nome !== "string" || !body.nome.trim()) {
    return "Il nome è obbligatorio.";
  }
  if (typeof body.cognome !== "string" || !body.cognome.trim()) {
    return "Il cognome è obbligatorio.";
  }
  if (body.telefono !== null && body.telefono !== undefined) {
    if (typeof body.telefono !== "string") {
      return "Formato telefono non valido.";
    }
    if (body.telefono.length > PHONE_MAX) {
      return `Il telefono non può superare ${PHONE_MAX} caratteri.`;
    }
  }
  if (body.cap !== null && body.cap !== undefined && body.cap !== "") {
    if (typeof body.cap !== "string" || !CAP_RE.test(body.cap)) {
      return "Il CAP deve essere composto da 5 cifre.";
    }
  }
  if (
    body.provincia !== null &&
    body.provincia !== undefined &&
    body.provincia !== ""
  ) {
    if (typeof body.provincia !== "string" || !PROVINCIA_RE.test(body.provincia)) {
      return "La provincia deve essere composta da 2 lettere (es. CS).";
    }
  }
  return null;
}

/** Completa il profilo con l'email di auth.users (sola lettura). */
function conEmail(profilo: ClienteProfilo | null, email: string): ClienteProfilo | null {
  if (!profilo) return null;
  return { ...profilo, email };
}

export async function GET() {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;
  const user = sessione.user;

  const profilo = await getProfilo(user.id);
  return apiOk({ profilo: conEmail(profilo, user.email ?? "") });
}

export async function PUT(request: Request) {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;
  const user = sessione.user;

  const body = (await request.json()) as Record<string, unknown>;

  const validationError = valida(body);
  if (validationError) {
    return apiError("VALIDATION_ERROR", validationError, 422);
  }

  const profilo = await aggiornaProfilo(user.id, {
    nome: String(body.nome),
    cognome: String(body.cognome),
    telefono: body.telefono != null ? String(body.telefono) : null,
    indirizzo: body.indirizzo != null ? String(body.indirizzo) : null,
    citta: body.citta != null ? String(body.citta) : null,
    cap: body.cap != null ? String(body.cap) : null,
    provincia: body.provincia != null ? String(body.provincia) : null,
  });

  if (!profilo) {
    return apiError("SAVE_FAILED", "Impossibile salvare il profilo.", 500);
  }

  return apiOk({ profilo: conEmail(profilo, user.email ?? "") });
}
