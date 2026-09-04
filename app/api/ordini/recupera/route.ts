import { apiError, apiOk } from "@/lib/api/response";
import { recuperaOrdiniGuest } from "@/lib/cliente/ordini";
import { setOrderAccessCookie } from "@/lib/cliente/order-access";
import { checkRateLimit } from "@/lib/rate-limiter";

/** Limiti anti-enumerazione: per IP, 10 richieste/minuto e 60/ora. */
const RECUPERO_RATE_LIMIT_PER_MINUTE = 10;
const RECUPERO_RATE_LIMIT_PER_HOUR = 60;

function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

/**
 * Chiave condivisa per IP: il rate limit non può essere aggirato cambiando
 * email/telefono e protegge anche i tentativi con credenziali errate.
 */
function chiaveRateLimit(request: Request): string {
  return `ordini-recupera:${ipRichiedente(request)}`;
}

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
  const rateCheck = await checkRateLimit(chiaveRateLimit(request), {
    subject: "scan_log",
    useSharedCounter: true,
    perMinute: RECUPERO_RATE_LIMIT_PER_MINUTE,
    perHour: RECUPERO_RATE_LIMIT_PER_HOUR,
    reasonLabel: "recuperi ordine",
  });
  if (!rateCheck.allowed) {
    return apiError("RATE_LIMITED", rateCheck.reason, 429, {
      retryAfter: rateCheck.retryAfter,
    });
  }

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
    const ordiniPubblici = ordini.map((ordine) => {
      const { email, telefono, ...rest } = ordine;
      void email;
      void telefono;
      return rest;
    });

    // Il recupero ha già verificato email + telefono lato server. Un cookie
    // separato per ordine consente di aprire la conferma senza rendere l'UUID
    // un bearer implicito e senza esporre il token nell'URL/browser history.
    const response = apiOk({ ordini: ordiniPubblici });
    for (const ordine of ordini) {
      setOrderAccessCookie(response, String(ordine.id));
    }
    return response;
  } catch (err) {
    console.error("[ordini/recupera] errore:", (err as Error)?.message ?? "sconosciuto");
    return apiError("INTERNAL_ERROR", "Impossibile cercare gli ordini. Riprova.", 500);
  }
}
