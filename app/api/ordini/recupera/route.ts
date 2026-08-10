import { apiError, apiOk } from "@/lib/api/response";
import { recuperaOrdiniGuest } from "@/lib/cliente/ordini";

/**
 * API Recupero ordini GUEST.
 *
 * POST /api/ordini/recupera
 * Il cliente inserisce email E telefono (entrambi obbligatori): il server
 * cerca gli ordini che corrispondono a ENTRAMBI i dati (mai al solo UUID,
 * mai a un singolo identificatore). Un ordine viene mostrato solo al suo
 * acquirente: nessun elenco completo, nessuna enumerazione.
 *
 * La ricerca avviene SOLO lato server; al browser non viene mai restituita
 * una query o una lista di ordini altrui.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";

  if (!email || !telefono) {
    return apiError("VALIDATION_ERROR", "Inserisci sia l'email sia il telefono usati per l'ordine.", 422);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return apiError("VALIDATION_ERROR", "Email non valida.", 422);
  }
  if (telefono.length > 30) {
    return apiError("VALIDATION_ERROR", "Telefono non valido.", 422);
  }

  try {
    const ordini = await recuperaOrdiniGuest(email, telefono);

    if (ordini.length === 0) {
      return apiError("NOT_FOUND", "Nessun ordine trovato con questi dati.", 404);
    }

    // Minima esposizione di dati: il client non ha bisogno di email/telefono
    // dell'ordine (l'utente li ha appena digitati per la ricerca).
    const ordiniPubblici = ordini.map(({ email: _email, telefono: _telefono, ...rest }) => rest);

    return apiOk({ ordini: ordiniPubblici });
  } catch (err) {
    console.error("[ordini/recupera] errore:", (err as Error)?.message ?? "sconosciuto");
    return apiError("INTERNAL_ERROR", "Impossibile cercare gli ordini. Riprova.", 500);
  }
}
