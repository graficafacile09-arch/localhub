import { apiError, apiOk } from "@/lib/api/response";
import {
  creaOrdiniCarrello,
  raggruppaPerNegozio,
  statusDaCodice,
  type RigaCarrelloInput,
} from "@/lib/cliente/ordini-carrello";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isStripeProntoPerNegozio } from "@/lib/pagamenti/config";

/** IP del richiedente (pattern già usato da /api/cliente/ordini). */
function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

/**
 * API Checkout Carrello (FASE F2.2).
 *
 * POST /api/cliente/ordini/carrello
 * Crea UN ORDINE SEPARATO per ogni negozio del carrello tramite le RPC
 * atomiche (crea_ordine_carrello per gruppi multi-riga, crea_ordine legacy
 * per i gruppi con 1 sola riga). Il client invia SOLO riferimenti
 * (prodottoId/varianteId/quantita) + dati cliente e consegna: negozi,
 * prezzi, nomi, immagini e totali vengono risolti esclusivamente dal DB.
 *
 * - IDEMPOTENZA: la chiave per negozio è derivata deterministicamente da
 *   checkoutKey + ':' + negozioId (≤64 caratteri): un retry della stessa
 *   checkoutKey restituisce gli ordini esistenti senza duplicati e senza
 *   un secondo decremento di stock.
 * - clienteUserId arriva SOLO dalla sessione Supabase (server-side);
 *   utente non loggato → ordini guest (cliente_user_id = NULL).
 * - RATE LIMIT per IP (stessi limiti di /api/cliente/ordini) PRIMA di
 *   qualunque operazione sul DB; oltre il limite → HTTP 429.
 * - PRE-FLIGHT fail-closed: prodotti/varianti/negozi validati PRIMA di
 *   creare qualunque ordine; con metodo "carta" ogni negozio deve avere
 *   Stripe configurato e attivo (altrimenti CARTA_NON_DISPONIBILE, nessun
 *   ordine creato).
 * - ERRORI PER NEGOZIO: se una RPC fallisce (es. scorte), l'ordine di quel
 *   negozio non viene creato (atomicità RPC) ma quelli degli altri negozi
 *   restano validi e vengono restituiti insieme all'errore.
 *
 * NON crea Checkout Session Stripe (lo farà F2.3).
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

  // ── Validazione esplicita dei valori: mai default silenziosi ───────────
  const modalita: "ritiro" | "spedizione" | null =
    body.modalita === "ritiro" ? "ritiro" : body.modalita === "spedizione" ? "spedizione" : null;
  if (!modalita) {
    return apiError("VALIDATION_ERROR", "Modalità di consegna non valida.", 422);
  }

  const checkoutKey = typeof body.checkoutKey === "string" ? body.checkoutKey.trim() : "";
  if (!checkoutKey || checkoutKey.length > 64) {
    return apiError("VALIDATION_ERROR", "Chiave di idempotenza non valida.", 422);
  }

  const righeRaw = body.righe;
  if (!Array.isArray(righeRaw) || righeRaw.length < 2 || righeRaw.length > 50) {
    return apiError("VALIDATION_ERROR", "Il carrello deve contenere da 2 a 50 prodotti.", 422);
  }
  const righe: RigaCarrelloInput[] = [];
  for (let i = 0; i < righeRaw.length; i++) {
    const r = (righeRaw[i] ?? {}) as Record<string, unknown>;
    const prodottoId =
      typeof r.prodottoId === "string" || typeof r.prodottoId === "number"
        ? String(r.prodottoId).trim()
        : "";
    if (!/^\d+$/.test(prodottoId)) {
      return apiError("VALIDATION_ERROR", `Prodotto non valido (riga ${i + 1}).`, 422);
    }
    const varianteIdRaw = r.varianteId;
    const varianteId =
      typeof varianteIdRaw === "string" && varianteIdRaw.trim() ? varianteIdRaw.trim() : null;
    const quantita = Number(r.quantita);
    if (!Number.isInteger(quantita) || quantita < 1 || quantita > 99) {
      return apiError("VALIDATION_ERROR", `Quantità non valida (1-99) per la riga ${i + 1}.`, 422);
    }
    righe.push({ prodottoId, varianteId, quantita });
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

  // ── Cliente autenticato (SERVER-SIDE): MAI un user id dal browser ──────
  const utenteAutenticato = await getCurrentUser();

  // Email destinataria della conferma: account (sessione) se autenticato,
  // altrimenti email raccolta nel checkout guest (se presente).
  const emailAccount = utenteAutenticato?.email ?? null;
  const emailBody =
    typeof clienteRaw.email === "string" && clienteRaw.email.trim()
      ? clienteRaw.email.trim()
      : null;
  const emailDestinataria = emailAccount ?? emailBody;

  // ── PRE-FLIGHT: risoluzione prodotti/varianti/negozi dal DB (fail-fast) ─
  // Nessun ordine viene creato se una riga è invalida (prodotto/variante/
  // negozio). Lo stock resta di competenza della RPC atomica.
  const raggruppamento = await raggruppaPerNegozio(righe);
  if (!raggruppamento.ok) {
    return apiError(
      raggruppamento.codice,
      raggruppamento.messaggio,
      statusDaCodice(raggruppamento.codice)
    );
  }

  // ── PRE-FLIGHT "carta" (fail-closed, come /api/cliente/ordini F1) ──────
  // Se il metodo è "carta", OGNI negozio del carrello deve avere Stripe
  // configurato e attivo: altrimenti rifiuta PRIMA di creare qualunque
  // ordine (mai ordini orfani senza pagamento possibile).
  if (modalita === "spedizione" && spedizioneRaw.metodoPagamento === "carta") {
    for (const gruppo of raggruppamento.negozi) {
      const pronta = await isStripeProntoPerNegozio(gruppo.negozioId);
      if (!pronta) {
        return apiError(
          "CARTA_NON_DISPONIBILE",
          "Il pagamento con carta non è disponibile per uno dei negozi del carrello.",
          422
        );
      }
    }
  }

  const esito = await creaOrdiniCarrello({
    checkoutKey,
    righe,
    modalita,
    cliente: {
      nome: typeof clienteRaw.nome === "string" ? clienteRaw.nome : "",
      cognome: typeof clienteRaw.cognome === "string" ? clienteRaw.cognome : "",
      telefono: typeof clienteRaw.telefono === "string" ? clienteRaw.telefono : null,
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
            provincia:
              typeof spedizioneRaw.provincia === "string" ? spedizioneRaw.provincia : "",
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
  });

  if (!esito.ok) {
    const primo = esito.errori[0];
    if (primo) {
      return apiError(primo.codice, primo.messaggio, statusDaCodice(primo.codice));
    }
    return apiError("SAVE_FAILED", "Impossibile completare il checkout.", 500);
  }

  // Almeno un ordine REALMENTE nuovo → 201; tutti già esistenti (retry) → 200.
  const almenoNuovo = esito.ordini.some((o) => !o.giaEsistente);
  return apiOk(
    {
      checkoutKey: esito.checkoutKey,
      ordini: esito.ordini,
      errori: esito.errori,
    },
    almenoNuovo ? 201 : 200
  );
}
