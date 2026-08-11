import { apiError, apiOk } from "@/lib/api/response";
import { creaOrdine, type CreaOrdineInput } from "@/lib/cliente/orders";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limiter";

/** IP del richiedente (pattern già usato da /api/assistente). */
function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

/**
 * API Ordini — Area Clienti.
 *
 * POST /api/cliente/ordini
 * Crea un ordine realmente salvato su Supabase in modo ATOMICO:
 * la funzione PostgreSQL crea_ordine blocca la riga del prodotto
 * (SELECT ... FOR UPDATE), valida, salva ordine + righe e decrementa le
 * scorte in un'unica transazione (migrazione 20260813_ordini_stock.sql).
 *
 * Il checkout è pubblico (nessuna sessione richiesta): l'acquisto avviene
 * dalla pagina prodotto senza login. Il payload contiene i dati del cliente
 * e la chiave di idempotenza generata dal client (anti doppio invio).
 *
 * RATE LIMIT: prima di qualunque operazione sul database viene contato il
 * numero di ordini creati da questo IP nell'ultimo minuto/ora (tabella
 * ordini, colonna cliente_ip) con lo stesso lib/rate-limiter.ts usato da
 * altri endpoint. Limiti: ORDINI_RATE_LIMIT_PER_MINUTE (default 6) e
 * ORDINI_RATE_LIMIT_PER_HOUR (default 40). Oltre il limite → HTTP 429,
 * nessun ordine e nessuna modifica allo stock.
 */
export async function POST(request: Request) {
  // ── Rate limit per IP (prima di qualunque operazione costosa sul DB) ──
  const ip = ipRichiedente(request);
  const rateCheck = await checkRateLimit(ip, {
    subject: "ordini",
    idColumn: "cliente_ip",
    useAdminClient: true,
    reasonLabel: "ordini",
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

  // ── Cliente autenticato (SERVER-SIDE): l'ordine viene associato
  // all'account tramite la SESSIONE Supabase (cookie httpOnly), MAI da un
  // user id inviato dal browser. Utente non loggato → ordine guest
  // (cliente_user_id = NULL nella RPC).
  const utenteAutenticato = await getCurrentUser();

  // Validazione esplicita dei valori: mai default silenziosi su valori non
  // validi (un input sbagliato va rifiutato, non riadattato).
  const modalita: "ritiro" | "spedizione" | null =
    body.modalita === "ritiro" ? "ritiro" : body.modalita === "spedizione" ? "spedizione" : null;
  if (!modalita) {
    return apiError("VALIDATION_ERROR", "Modalità di consegna non valida.", 422);
  }
  const clienteRaw = (body.cliente ?? {}) as Record<string, unknown>;
  const ritiroRaw = (body.ritiro ?? {}) as Record<string, unknown>;
  const spedizioneRaw = (body.spedizione ?? {}) as Record<string, unknown>;

  if (
    spedizioneRaw.metodoSpedizione !== undefined &&
    spedizioneRaw.metodoSpedizione !== "standard" &&
    spedizioneRaw.metodoSpedizione !== "express"
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di spedizione non valido.", 422);
  }
  if (
    spedizioneRaw.metodoPagamento !== undefined &&
    spedizioneRaw.metodoPagamento !== "carta" &&
    spedizioneRaw.metodoPagamento !== "paypal" &&
    spedizioneRaw.metodoPagamento !== "bonifico"
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di pagamento non valido.", 422);
  }

  // Email destinataria della conferma: se l'utente è autenticato si usa
  // l'email dell'ACCOUNT (sessione), altrimenti quella raccolta nel checkout
  // guest (se presente). L'email del body non viene mai fidato come prova
  // di identità: l'associazione all'account avviene solo via sessione.
  const emailAccount = utenteAutenticato?.email ?? null;
  const emailBody =
    typeof clienteRaw.email === "string" && clienteRaw.email.trim()
      ? clienteRaw.email.trim()
      : null;
  const emailDestinataria = emailAccount ?? emailBody;

  // Variante selezionata (FASE E4): solo TRASPORTATA fino al servizio
  // ordini. La validazione di appartenenza/attivo/obbligatorietà avviene
  // server-side in lib/cliente/orders.ts (mai fidarsi del client).
  const varianteIdRaw = body.varianteId;
  const varianteId =
    typeof varianteIdRaw === "string" && varianteIdRaw.trim()
      ? varianteIdRaw.trim()
      : null;

  const input: CreaOrdineInput = {
    idempotencyKey:
      typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
    prodottoId:
      typeof body.prodottoId === "string" || typeof body.prodottoId === "number"
        ? String(body.prodottoId)
        : "",
    varianteId,
    quantita: Number(body.quantita),
    modalita,
    cliente: {
      nome: typeof clienteRaw.nome === "string" ? clienteRaw.nome : "",
      cognome: typeof clienteRaw.cognome === "string" ? clienteRaw.cognome : "",
      telefono:
        typeof clienteRaw.telefono === "string" ? clienteRaw.telefono : null,
      email: emailDestinataria,
    },
    clienteUserId: utenteAutenticato?.id ?? null,
    ritiro:
      modalita === "spedizione"
        ? null
        : {
            data: typeof ritiroRaw.data === "string" ? ritiroRaw.data : null,
            fascia: typeof ritiroRaw.fascia === "string" ? ritiroRaw.fascia : null,
          },
    spedizione:
      modalita === "spedizione"
        ? {
            indirizzo: typeof spedizioneRaw.indirizzo === "string" ? spedizioneRaw.indirizzo : "",
            cap: typeof spedizioneRaw.cap === "string" ? spedizioneRaw.cap : "",
            citta: typeof spedizioneRaw.citta === "string" ? spedizioneRaw.citta : "",
            provincia: typeof spedizioneRaw.provincia === "string" ? spedizioneRaw.provincia : "",
            note: typeof spedizioneRaw.note === "string" ? spedizioneRaw.note : null,
            metodoSpedizione:
              spedizioneRaw.metodoSpedizione === "express" ? "express" : "standard",
            metodoPagamento:
              spedizioneRaw.metodoPagamento === "paypal"
                ? "paypal"
                : spedizioneRaw.metodoPagamento === "bonifico"
                  ? "bonifico"
                  : "carta",
          }
        : null,
    note: typeof body.note === "string" ? body.note : null,
    clienteIp: ip,
  };

  const esito = await creaOrdine(input);

  if (!esito.ok) {
    return apiError(esito.codice, esito.errore, esito.status);
  }

  return apiOk({ ordine: esito.ordine, giaEsistente: esito.giaEsistente }, esito.giaEsistente ? 200 : 201);
}
