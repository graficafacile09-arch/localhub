import { apiError, apiOk } from "@/lib/api/response";
import {
  creaOrdiniCarrello,
  raggruppaPerNegozio,
  statusDaCodice,
  type OrdineCarrelloNegozio,
  type RigaCarrelloInput,
} from "@/lib/cliente/ordini-carrello";
import { parseFatturazioneRaw } from "@/lib/cliente/orders";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isProviderProntoPerNegozio } from "@/lib/pagamenti/config";
import {
  chiudiOrdineSenzaPagamento,
  creaSessionePagamentoPerOrdine,
} from "@/lib/pagamenti/sessioni";
import {
  isCarrierCodice,
  isServizioValidoPerCarrier,
  type CarrierCodice,
  type ServizioCodice,
} from "@/lib/spedizioni/catalogo";

/** IP del richiedente (pattern già usato da /api/cliente/ordini). */
function ipRichiedente(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}

/**
 * Dispatch metodo di pagamento → provider gateway (fail-closed):
 *   carta → stripe · klarna → klarna · scalapay → scalapay ·
 *   paypal → paypal · bonifico → null.
 * Il bonifico non ha sessione gateway; nessun fallback silenzioso.
 */
function providerDaMetodoPagamento(metodo: string | undefined): string | null {
  if (metodo === "carta") return "stripe";
  if (metodo === "klarna") return "klarna";
  if (metodo === "scalapay") return "scalapay";
  if (metodo === "paypal") return "paypal";
  return null;
}

/** Codice errore "non disponibile" per provider (retrocompatibile carta). */
function codiceNonDisponibile(provider: string): string {
  return provider === "stripe" ? "CARTA_NON_DISPONIBILE" : `${provider.toUpperCase()}_NON_DISPONIBILE`;
}

/** Messaggio utente "non disponibile" per provider. */
function messaggioNonDisponibile(provider: string): string {
  return provider === "stripe"
    ? "Il pagamento con carta non è disponibile per uno dei negozi del carrello."
    : `Il pagamento con ${provider} non è disponibile per uno dei negozi del carrello.`;
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
 * FASE F2.5 — con metodo "carta" (spedizione) ogni ordine creato/riusato
 * riceve la PROPRIA Checkout Session Stripe (mai una sessione multi-negozio):
 *   - una sessione per ordine, ognuna con il proprio client_reference_id;
 *   - la risposta arricchisce ogni ordine con pagamento.redirectUrl;
 *   - se la sessione di UN negozio fallisce, quell'ordine viene chiuso
 *     (stock ripristinato, stesso pattern del buy-now) senza toccare gli
 *     ordini degli altri negozi.
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
  if (!Array.isArray(righeRaw) || righeRaw.length < 1 || righeRaw.length > 50) {
    return apiError("VALIDATION_ERROR", "Il carrello deve contenere da 1 a 50 prodotti.", 422);
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

  // ── MOTORE TARIFFARIO — corriere + servizio (mai un prezzo dal browser) ──
  // La RPC ricalcola sempre il costo; qui si valida SOLO che corriere/servizio
  // esistano davvero (niente default silenziosi).
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
  if (
    spedizioneRaw.metodoPagamento !== undefined &&
    spedizioneRaw.metodoPagamento !== "carta" &&
    spedizioneRaw.metodoPagamento !== "paypal" &&
    spedizioneRaw.metodoPagamento !== "klarna" &&
    spedizioneRaw.metodoPagamento !== "scalapay" &&
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

  // ── PRE-FLIGHT per provider (fail-closed, come /api/cliente/ordini F1) ──
  // Se il metodo richiede un gateway (carta→stripe, klarna→klarna), OGNI
  // negozio del carrello deve avere quel provider configurato e attivo:
  // altrimenti rifiuta PRIMA di creare qualunque ordine (mai ordini orfani
  // senza pagamento possibile). Bonifico → nessun gateway → nessun check.
  const providerRichiesto =
    modalita === "spedizione" ? providerDaMetodoPagamento(spedizioneRaw.metodoPagamento) : null;
  if (providerRichiesto) {
    for (const gruppo of raggruppamento.negozi) {
      const pronta = await isProviderProntoPerNegozio(gruppo.negozioId, providerRichiesto);
      if (!pronta) {
        return apiError(
          codiceNonDisponibile(providerRichiesto),
          messaggioNonDisponibile(providerRichiesto),
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
            carrier: carrier as CarrierCodice,
            servizio: servizio as ServizioCodice,
            metodoPagamento:
              spedizioneRaw.metodoPagamento === "paypal"
                ? "paypal"
                : spedizioneRaw.metodoPagamento === "bonifico"
                  ? "bonifico"
                  : "carta",
          }
        : null,
    fatturazione:
      modalita === "spedizione" ? parseFatturazioneRaw(body.fatturazione) : null,
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

  // ── Sessioni per negozio (solo metodi con gateway: carta→stripe, ────────
  //    klarna→klarna). Ogni ordine (creato O riusato da un retry idempotente)
  //    riceve la PROPRIA sessione del provider: mai una sessione multi-negozio
  //    né un fallback silenzioso su un altro provider. Se la sessione di un
  //    negozio fallisce, quell'ordine viene chiuso (stock ripristinato, stesso
  //    pattern del buy-now) e registrato come errore per negozio: gli ordini
  //    degli altri negozi restano validi con le loro sessioni.
  const providerRichiesto2 =
    modalita === "spedizione" ? providerDaMetodoPagamento(spedizioneRaw.metodoPagamento) : null;
  const ordiniArricchiti: OrdineCarrelloNegozio[] = [...esito.ordini];
  const erroriAggiuntivi = [...esito.errori];

  if (providerRichiesto2) {
    for (let i = 0; i < ordiniArricchiti.length; i++) {
      const ordine = ordiniArricchiti[i];
      const sessione = await creaSessionePagamentoPerOrdine(ordine.ordineId, providerRichiesto2);
      if (sessione.ok) {
        ordine.pagamento = {
          redirectUrl: sessione.redirectUrl,
          sessioneId: sessione.sessioneId,
          giaEsistente: sessione.giaEsistente,
        };
      } else {
        // L'ordine non può essere pagato con il metodo scelto: lo chiudiamo
        // SOLO se è stato creato in questo checkout (retry di un ordine già
        // esistente con sessione scaduta → non si chiude, resta tracciabile).
        if (!ordine.giaEsistente) {
          await chiudiOrdineSenzaPagamento(ordine.ordineId).catch(() => {});
        }
        erroriAggiuntivi.push({
          negozioId: ordine.negozioId,
          codice: sessione.codice,
          messaggio: sessione.errore,
        });
        // L'ordine resta nella risposta (stato/campi dal DB, chiaro all'UI
        // che il pagamento non è partito), ma senza redirectUrl.
        ordine.pagamento = null;
      }
    }
  }

  // Almeno un ordine REALMENTE nuovo → 201; tutti già esistenti (retry) → 200.
  const almenoNuovo = esito.ordini.some((o) => !o.giaEsistente);
  return apiOk(
    {
      checkoutKey: esito.checkoutKey,
      ordini: ordiniArricchiti,
      errori: erroriAggiuntivi,
    },
    almenoNuovo ? 201 : 200
  );
}
