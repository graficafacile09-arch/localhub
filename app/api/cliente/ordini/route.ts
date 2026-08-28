import { apiError, apiOk } from "@/lib/api/response";
import { creaOrdine, parseFatturazioneRaw, type CreaOrdineInput } from "@/lib/cliente/orders";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestMode } from "@/lib/auth/guest";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  cartaDisponibilePerProdotto,
  providerDisponibilePerProdotto,
} from "@/lib/pagamenti/config";
import {
  chiudiOrdineSenzaPagamento,
  creaSessionePagamentoPerOrdine,
  creaSessioneStripePerOrdine,
} from "@/lib/pagamenti/sessioni";
import {
  isCarrierCodice,
  isServizioValidoPerCarrier,
  type CarrierCodice,
  type ServizioCodice,
} from "@/lib/spedizioni/catalogo";

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
  // user id inviato dal browser.
  const utenteAutenticato = await getCurrentUser();

  // ── Modalità GUEST ESPLICITA: solo utenti che hanno scelto "ACQUISTA SENZA ACCOUNT"
  // possono creare ordini senza essere autenticati. Il cookie httpOnly lh_guest
  // viene impostato SOLO tramite la route /api/auth/guest (click esplicito).
  const guestMode = await getGuestMode();

  // BLOCCO: utente anonimo SENZA modalità guest esplicita → 403
  if (!utenteAutenticato && !guestMode) {
    return apiError(
      "GUEST_REQUIRED",
      "Per acquistare devi accedere al tuo account o scegliere \"ACQUISTA SENZA ACCOUNT\" dal menu.",
      403
    );
  }

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

  // ── VALIDAZIONE GUEST: email e telefono OBBLIGATORI per modalità guest ──────
  // Se l'utente NON è autenticato (quindi è in modalità guest esplicita),
  // email e telefono sono obbligatori sia per spedizione che per ritiro.
  if (!utenteAutenticato) {
    const email = typeof clienteRaw.email === "string" ? clienteRaw.email.trim() : "";
    const telefono = typeof clienteRaw.telefono === "string" ? clienteRaw.telefono.trim() : "";
    if (!email) {
      return apiError("VALIDATION_ERROR", "L'email è obbligatoria per l'acquisto come ospite.", 422);
    }
    if (!telefono) {
      return apiError("VALIDATION_ERROR", "Il telefono è obbligatorio per l'acquisto come ospite.", 422);
    }
    // Validazione formato email base
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("VALIDATION_ERROR", "Formato email non valido.", 422);
    }
  }

  // ── CONTRATTO BUY-NOW: metodo di pagamento esplicito e OBBLIGATORIO ─────
  // Per la modalità spedizione il metodo deve essere SCELTO DALL'UTENTE:
  // mai default/fallback (né bonifico, né carta, né klarna). Tre casi:
  //   1) valore non ammesso ("paypal", "qualcosa", ...) → 422, zero ordini;
  //   2) assente / null / "" con modalità spedizione       → 422, zero ordini;
  //   3) valido → si prosegue con disponibilità + pre-flight provider.
  const metodoScelto = spedizioneRaw.metodoPagamento;
  const metodoValido =
    metodoScelto === "carta" ||
    metodoScelto === "bonifico" ||
    metodoScelto === "klarna" ||
    metodoScelto === "scalapay" ||
    metodoScelto === "paypal";
  // Valore PRESENTE ma non ammesso ("paypal", "qualcosa", ...): rifiuto
  // sempre, indipendentemente dalla modalità → mai un ordine con un metodo
  // che il server non conosce.
  if (
    metodoScelto !== undefined &&
    metodoScelto !== null &&
    metodoScelto !== "" &&
    !metodoValido
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di pagamento non valido.", 422);
  }
  // Modalità SPEDIZIONE: il metodo deve essere stato SCELTO ESPLICITAMENTE
  // dall'utente. Assente, null o "" → stessa risposta dedicata, zero ordini.
  // (La modalità ritiro resta invariata: il pagamento si concorda in negozio.)
  if (modalita === "spedizione" && !metodoValido) {
    return apiError(
      "METODO_PAGAMENTO_NON_SCELTO",
      "Seleziona un metodo di pagamento per continuare.",
      422
    );
  }

  // ── FASE F1 — pre-flight "carta": il metodo carta apre DAVVERO Stripe. ──
  // Se il negozio del prodotto non ha Stripe configurato e attivo, il
  // checkout rifiuta PRIMA di creare l'ordine (mai ordini orfani).
  const prodottoIdRaw =
    typeof body.prodottoId === "string" || typeof body.prodottoId === "number"
      ? String(body.prodottoId)
      : "";
  const vuoleCarta =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "carta";
  if (vuoleCarta) {
    const cartaPronta = await cartaDisponibilePerProdotto(prodottoIdRaw);
    if (!cartaPronta) {
      return apiError(
        "CARTA_NON_DISPONIBILE",
        "Il pagamento con carta non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── PRE-FLIGHT "klarna" (stessa regola di carta): se il negozio del
  // prodotto non ha Klarna configurato e attivo, il checkout rifiuta PRIMA
  // di creare l'ordine. Nessun fallback automatico su Stripe: se Klarna non
  // è disponibile l'utente riceve un errore chiaro e può scegliere altro.
  const vuoleKlarna =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "klarna";
  if (vuoleKlarna) {
    const klarnaPronta = await providerDisponibilePerProdotto(prodottoIdRaw, "klarna");
    if (!klarnaPronta) {
      return apiError(
        "KLARNA_NON_DISPONIBILE",
        "Il pagamento con Klarna non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── PRE-FLIGHT "paypal" (stessa regola di carta/klarna): se il negozio del
  // prodotto non ha PayPal configurato e attivo, il checkout rifiuta PRIMA di
  // creare l'ordine. Nessun fallback automatico su Stripe/Klarna: se PayPal
  // non è disponibile l'utente riceve un errore chiaro e può scegliere altro.
  const vuolePaypal =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "paypal";
  if (vuolePaypal) {
    const paypalPronta = await providerDisponibilePerProdotto(prodottoIdRaw, "paypal");
    if (!paypalPronta) {
      return apiError(
        "PAYPAL_NON_DISPONIBILE",
        "Il pagamento con PayPal non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── PRE-FLIGHT "scalapay" (stessa regola di carta/klarna/paypal): se il
  // negozio del prodotto non ha Scalapay configurato e attivo, il checkout
  // rifiuta PRIMA di creare l'ordine. Nessun fallback automatico.
  const vuoleScalapay =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "scalapay";
  if (vuoleScalapay) {
    const scalapayPronta = await providerDisponibilePerProdotto(prodottoIdRaw, "scalapay");
    if (!scalapayPronta) {
      return apiError(
        "SCALAPAY_NON_DISPONIBILE",
        "Il pagamento con Scalapay non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── MOTORE TARIFFARIO — corriere + servizio (mai un prezzo dal browser) ──
  // La RPC ricalcola sempre il costo; qui si valida SOLO che il corriere e il
  // servizio indicati esistano davvero (niente default silenziosi).
  const carrier: CarrierCodice | null = isCarrierCodice(spedizioneRaw.carrier)
    ? spedizioneRaw.carrier
    : null;
  const servizio: ServizioCodice | null =
    carrier !== null && isServizioValidoPerCarrier(carrier, spedizioneRaw.servizio)
      ? spedizioneRaw.servizio
      : null;
  if (modalita === "spedizione" && (!carrier || !servizio)) {
    return apiError(
      "CORRIERE_NON_VALIDO",
      "Seleziona un corriere di spedizione valido.",
      422
    );
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
    prodottoId: prodottoIdRaw,
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
            carrier: carrier as CarrierCodice,
            servizio: servizio as ServizioCodice,
            // NOTA (coerenza con /api/cliente/ordini/carrello F2.2): le RPC
            // crea_ordine/crea_ordine_carrello accettano solo
            // carta/paypal/bonifico come metodo_pagamento. Il flusso klarna
            // salva 'carta' nella colonna e marca l'ordine con
            // payment_provider='klarna' (marcatore autoritativo impostato
            // dall'orchestratore al momento della sessione). PayPal è ammesso
            // dalla RPC → 'paypal' viene salvato direttamente. Nessuna
            // migration. Mai un default: un metodo assente è già stato
            // rifiutato con 422.
            metodoPagamento:
              spedizioneRaw.metodoPagamento === "bonifico"
                ? "bonifico"
                : spedizioneRaw.metodoPagamento === "paypal"
                  ? "paypal"
                  : "carta",
          }
        : null,
    fatturazione:
      modalita === "spedizione" ? parseFatturazioneRaw(body.fatturazione) : null,
    note: typeof body.note === "string" ? body.note : null,
    clienteIp: ip,
  };

  const esito = await creaOrdine(input);

  if (!esito.ok) {
    return apiError(esito.codice, esito.errore, esito.status);
  }

  // ── FASE F1 — metodo "carta": dopo la creazione ordine (stock decrementato
  // = riserva) viene creata la sessione Stripe e il client viene reindirizzato.
  // Se la creazione sessione fallisce l'ordine viene chiuso subito (stock
  // ripristinato) e l'errore è chiaro: mai ordini orfani senza pagamento.
  let pagamento: { redirectUrl: string } | null = null;
  if (vuoleCarta) {
    const sessione = await creaSessioneStripePerOrdine(esito.ordine.id);
    if (sessione.ok) {
      pagamento = { redirectUrl: sessione.redirectUrl };
    } else {
      await chiudiOrdineSenzaPagamento(esito.ordine.id).catch(() => {});
      return apiError(sessione.codice, sessione.errore, 422);
    }
  } else if (vuoleKlarna) {
    // Klarna: stessa orchestrazione del carrello (F2.5) — la sessione viene
    // creata dal gateway Klarna (creaSessionePagamentoPerOrdine, provider
    // 'klarna'): mai una sessione Stripe, mai un fallback silenzioso.
    const sessione = await creaSessionePagamentoPerOrdine(esito.ordine.id, "klarna");
    if (sessione.ok) {
      pagamento = { redirectUrl: sessione.redirectUrl };
    } else {
      await chiudiOrdineSenzaPagamento(esito.ordine.id).catch(() => {});
      return apiError(sessione.codice, sessione.errore, 422);
    }
  } else if (vuolePaypal) {
    // PayPal: stessa orchestrazione del carrello — la sessione viene creata
    // dal gateway PayPal (creaSessionePagamentoPerOrdine, provider 'paypal'):
    // mai una sessione Stripe/Klarna, mai un fallback silenzioso.
    const sessione = await creaSessionePagamentoPerOrdine(esito.ordine.id, "paypal");
    if (sessione.ok) {
      pagamento = { redirectUrl: sessione.redirectUrl };
    } else {
      await chiudiOrdineSenzaPagamento(esito.ordine.id).catch(() => {});
      return apiError(sessione.codice, sessione.errore, 422);
    }
  } else if (vuoleScalapay) {
    // Scalapay: stessa orchestrazione del carrello — la sessione viene creata
    // dal gateway Scalapay (creaSessionePagamentoPerOrdine, provider
    // 'scalapay'): mai una sessione Stripe/Klarna/PayPal, mai un fallback.
    const sessione = await creaSessionePagamentoPerOrdine(esito.ordine.id, "scalapay");
    if (sessione.ok) {
      pagamento = { redirectUrl: sessione.redirectUrl };
    } else {
      await chiudiOrdineSenzaPagamento(esito.ordine.id).catch(() => {});
      return apiError(sessione.codice, sessione.errore, 422);
    }
  }

  return apiOk(
    {
      ordine: esito.ordine,
      giaEsistente: esito.giaEsistente,
      pagamento,
    },
    esito.giaEsistente ? 200 : 201
  );
}
