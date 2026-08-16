import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { aggiornaProfilo, getProfilo } from "@/lib/cliente/profile";
import type { ClienteProfilo } from "@/lib/cliente/types";

const PHONE_MAX = 30;

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
  return null;
}

/** Completa il profilo con l'email di auth.users (sola lettura). */
function conEmail(profilo: ClienteProfilo | null, email: string): ClienteProfilo | null {
  if (!profilo) return null;
  return { ...profilo, email };
}

/**
 * GET /api/cliente/impostazioni
 *
 * Impostazioni Area Clienti: restituisce i dati personali modificabili
 * (nome, cognome, telefono) più l'email dell'account (sola lettura da
 * auth.users). Riusa gli stessi servizi di lib/cliente/profile.ts usati
 * dalla pagina Profilo: nessuna logica duplicata.
 */
export async function GET() {
  const { sessione, error } = await requireApiArea("cliente");
  if (error) return error;
  const user = sessione.user;

  const profilo = await getProfilo(user.id);
  return apiOk({ profilo: conEmail(profilo, user.email ?? "") });
}

/**
 * PUT /api/cliente/impostazioni
 *
 * Salva i dati personali modificabili (nome, cognome, telefono). L'email
 * resta di sola lettura da auth.users: non viene mai scritta qui.
 */
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
    return apiError("SAVE_FAILED", "Impossibile salvare le impostazioni.", 500);
  }

  return apiOk({ profilo: conEmail(profilo, user.email ?? "") });
}
