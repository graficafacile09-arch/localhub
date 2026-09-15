import { apiError, apiOk } from "@/lib/api/response";
import { creaOrdine, parseFatturazioneRaw, type CreaOrdineInput } from "@/lib/cliente/orders";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestMode } from "@/lib/auth/guest";
import { checkRateLimit } from "@/lib/rate-limiter";
import { setOrderAccessCookie } from "@/lib/cliente/order-access";
import {
  annullaIntentoCheckout,
  costruisciPayloadIntentoCheckout,
  creaIntentoCheckout,
  creaSessionePagamentoPerIntento,
  providerDaMetodoPagamento,
} from "@/lib/pagamenti/sessioni";
import { metodoDisponibilePerProdotto } from "@/lib/pagamenti/metodi-pubblici";
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
  //   1) valore non ammesso → 422, zero ordini;
  //   2) assente / null / "" con modalità spedizione       → 422, zero ordini;
  //   3) valido → si prosegue con disponibilità + pre-flight provider.
  const metodoScelto = spedizioneRaw.metodoPagamento;
  const metodoValido =
    metodoScelto === "carta" ||
    metodoScelto === "bonifico" ||
    metodoScelto === "bonifico_istantaneo" ||
    metodoScelto === "klarna";
  // Valore PRESENTE ma non ammesso: rifiuto
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
    const cartaPronta = await metodoDisponibilePerProdotto(prodottoIdRaw, "carta");
    if (!cartaPronta) {
      return apiError(
        "CARTA_NON_DISPONIBILE",
        "Il pagamento con carta non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── B2 — PRE-FLIGHT "klarna" (metodo → Stripe): disponibile SOLO se il
  // metodo è attivato dal negozio E la capability klarna_payments è ACTIVE
  // sul connected account (isMetodoDisponibile). Nessun fallback: se Klarna
  // non è disponibile l'utente riceve un errore chiaro e può scegliere altro.
  const vuoleKlarna =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "klarna";
  if (vuoleKlarna) {
    const klarnaPronta = await metodoDisponibilePerProdotto(prodottoIdRaw, "klarna");
    if (!klarnaPronta) {
      return apiError(
        "KLARNA_NON_DISPONIBILE",
        "Il pagamento con Klarna non è disponibile per questo negozio.",
        422
      );
    }
  }

  const vuoleBonificoIstantaneo =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "bonifico_istantaneo";
  if (vuoleBonificoIstantaneo) {
    const pronto = await metodoDisponibilePerProdotto(prodottoIdRaw, "bonifico_istantaneo");
    if (!pronto) {
      return apiError(
        "BONIFICO_ISTANTANEO_NON_DISPONIBILE",
        "Il bonifico istantaneo non è disponibile per questo negozio.",
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
            // Le RPC storiche persistono i metodi online Stripe come carta;
            // bonifico manuale resta il solo metodo non-gateway.
            metodoPagamento:
              spedizioneRaw.metodoPagamento === "bonifico" ? "bonifico" : "carta",
          }
        : null,
    fatturazione:
      modalita === "spedizione" ? parseFatturazioneRaw(body.fatturazione) : null,
    note: typeof body.note === "string" ? body.note : null,
    clienteIp: ip,
  };

  // ── P1 PAYMENT-FIRST — metodi ONLINE: INTENTO, mai un ordine ────────────
  // I metodi online Stripe NON creano più una riga in `ordini` prima
  // del pagamento: la RPC checkout_intento_crea valida, RISERVA lo stock
  // (quantita_riservata) e crea la sessione con ordine_id = NULL; poi la
  // sessione del provider viene creata sull'intento. Se la creazione della
  // sessione provider fallisce → l'intento viene annullato (riserva
  // rilasciata): mai un ordine, mai una riserva fantasma.
  const providerOnline =
    modalita === "spedizione"
      ? providerDaMetodoPagamento(
          typeof spedizioneRaw.metodoPagamento === "string"
            ? spedizioneRaw.metodoPagamento
            : undefined
        )
      : null;

  if (providerOnline) {
    const intento = await creaIntentoCheckout(
      costruisciPayloadIntentoCheckout({
        checkoutKey: input.idempotencyKey,
        provider: providerOnline,
        // Gli intenti online esistono SOLO per la modalità spedizione.
        modalita: "spedizione",
        righe: [
          {
            prodottoId: input.prodottoId,
            varianteId: input.varianteId ?? null,
            quantita: input.quantita,
          },
        ],
        cliente: input.cliente,
        clienteUserId: utenteAutenticato?.id ?? null,
        clienteIp: ip,
        spedizione: {
          indirizzo: input.spedizione!.indirizzo,
          cap: input.spedizione!.cap,
          citta: input.spedizione!.citta,
          provincia: input.spedizione!.provincia,
          note: input.spedizione!.note ?? null,
          carrier: input.spedizione!.carrier as string,
          servizio: input.spedizione!.servizio as string,
          metodoPagamento: String(spedizioneRaw.metodoPagamento),
        },
        fatturazione: input.fatturazione ?? null,
        note: input.note ?? null,
      })
    );
    if (!intento.ok) {
      return apiError(intento.codice, intento.errore, intento.status);
    }

    const sessione = await creaSessionePagamentoPerIntento(
      intento.checkoutId,
      providerOnline
    );
    if (!sessione.ok) {
      // Riserva rilasciata: nessun ordine, nessuna riserva fantasma.
      await annullaIntentoCheckout(intento.checkoutId).catch(() => {});
      return apiError(sessione.codice, sessione.errore, 422);
    }

    const checkoutId = intento.checkoutId;
    const response = apiOk(
      {
        checkoutId,
        checkoutKey: intento.checkoutKey,
        negozioId: intento.negozioId,
        negozioNome: intento.negozioNome,
        totale: intento.totale,
        // Compatibilità risposta client: per i metodi online il redirect al
        // provider avviene via pagamento.redirectUrl; `ordine.id` resta il
        // riferimento (id sessione/intento) richiesto dal contratto esistente.
        ordine: { id: checkoutId, numero: checkoutId.slice(0, 8).toUpperCase() },
        giaEsistente: intento.giaEsistente,
        pagamento: { redirectUrl: sessione.redirectUrl },
      },
      intento.giaEsistente ? 200 : 201
    );
    if (!utenteAutenticato) {
      setOrderAccessCookie(response, checkoutId);
    }
    return response;
  }

  // ── BONIFICO / RITIRO — comportamento INVARIATO: ordine creato subito ──
  // Il pagamento avviene fuori piattaforma (bonifico) o in negozio (ritiro),
  // quindi l'ordine nasce subito con le notifiche esistenti: nessun intento.
  const esito = await creaOrdine(input);

  if (!esito.ok) {
    return apiError(esito.codice, esito.errore, esito.status);
  }

  const response = apiOk(
    {
      ordine: esito.ordine,
      giaEsistente: esito.giaEsistente,
    },
    esito.giaEsistente ? 200 : 201
  );
  if (!utenteAutenticato && esito.ordine?.id) {
    setOrderAccessCookie(response, esito.ordine.id);
  }
  return response;
}
