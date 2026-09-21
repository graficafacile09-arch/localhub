import { apiError, apiOk } from "@/lib/api/response";
import { utentePossiedeNegozio } from "@/lib/merchant/data";
import {
  chiavePerNegozio,
  creaOrdiniCarrello,
  raggruppaPerNegozio,
  statusDaCodice,
  type ErroreNegozio,
  type OrdineCarrelloNegozio,
  type RigaCarrelloInput,
} from "@/lib/cliente/ordini-carrello";
import { parseFatturazioneRaw } from "@/lib/cliente/orders";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestMode } from "@/lib/auth/guest";
import { checkRateLimit } from "@/lib/rate-limiter";
import { setOrderAccessCookie } from "@/lib/cliente/order-access";
import { getDatiBonificoDiretto, isMetodoDisponibile } from "@/lib/pagamenti/metodi-pubblici";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  annullaIntentoCheckout,
  costruisciPayloadIntentoCheckout,
  creaIntentoCheckout,
  creaSessionePagamentoPerIntento,
} from "@/lib/pagamenti/sessioni";
import { providerDaMetodoPagamento } from "@/lib/pagamenti/registry";
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

/** Codice errore "non disponibile" per provider (retrocompatibile carta). */
function codiceNonDisponibile(provider: string, metodo?: string): string {
  if (provider === "stripe" && metodo === "paypal") return "PAYPAL_NON_DISPONIBILE";
  if (provider === "stripe" && metodo === "sepa_debit") return "SEPA_NON_DISPONIBILE";
  return provider === "stripe" ? "CARTA_NON_DISPONIBILE" : `${provider.toUpperCase()}_NON_DISPONIBILE`;
}

/** Messaggio utente "non disponibile" per provider. */
function messaggioNonDisponibile(provider: string, metodo?: string): string {
  if (provider === "stripe" && metodo === "paypal") {
    return "Il pagamento con PayPal tramite Stripe non è disponibile per uno dei negozi del carrello.";
  }
  if (provider === "stripe" && metodo === "sepa_debit") {
    return "Il pagamento SEPA Direct Debit non è disponibile per uno dei negozi del carrello.";
  }
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
    spedizioneRaw.metodoPagamento !== "klarna" &&
    spedizioneRaw.metodoPagamento !== "bonifico_istantaneo" &&
    spedizioneRaw.metodoPagamento !== "paypal" &&
    spedizioneRaw.metodoPagamento !== "sepa_debit" &&
    spedizioneRaw.metodoPagamento !== "bonifico_diretto_venditore"
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di pagamento non valido.", 422);
  }

  // ── Cliente autenticato (SERVER-SIDE): MAI un user id dal browser ──────
  const utenteAutenticato = await getCurrentUser();

  // ── Modalità GUEST ESPLICITA: solo utenti che hanno scelto "ACQUISTA SENZA ACCOUNT"
  // possono creare ordini senza essere autenticati.
  const guestMode = await getGuestMode();

  // BLOCCO: utente anonimo SENZA modalità guest esplicita → 403
  if (!utenteAutenticato && !guestMode) {
    return apiError(
      "GUEST_REQUIRED",
      "Per acquistare devi accedere al tuo account o scegliere \"ACQUISTA SENZA ACCOUNT\" dal menu.",
      403
    );
  }

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

  const vuoleBonificoDiretto =
    modalita === "spedizione" && spedizioneRaw.metodoPagamento === "bonifico_diretto_venditore";
  let datiBonificoDiretto: Awaited<ReturnType<typeof getDatiBonificoDiretto>> = null;
  if (vuoleBonificoDiretto) {
    if (raggruppamento.negozi.length > 1) {
      return apiError(
        "BONIFICO_DIRETTO_MULTI_VENDITORE",
        "Il bonifico bancario diretto al venditore è disponibile solo per ordini relativi a un singolo venditore.",
        422
      );
    }
    datiBonificoDiretto = await getDatiBonificoDiretto(raggruppamento.negozi[0].negozioId);
    if (!datiBonificoDiretto) {
      return apiError(
        "BONIFICO_DIRETTO_NON_DISPONIBILE",
        "Il bonifico bancario diretto al venditore non è disponibile per questo negozio.",
        422
      );
    }
  }

  // ── BLOCCO AUTO-ACQUISTO DEL VENDITORE (regola di sicurezza) ───────────
  // Se il carrello contiene prodotti del PROPRIO negozio, l'intero checkout
  // viene rifiutato PRIMA di creare qualunque ordine: un venditore può
  // acquistare dai negozi altrui, mai dai propri. Verifica server-side su
  // negozi.owner_user_id: vale anche aggirando il frontend. Solo utenti
  // autenticati; il checkout guest resta invariato.
  if (utenteAutenticato) {
    for (const gruppo of raggruppamento.negozi) {
      const proprio = await utentePossiedeNegozio(
        utenteAutenticato.id,
        gruppo.negozioId
      );
      if (proprio) {
        return apiError(
          "PRODOTTO_DEL_PROPRIO_NEGOZIO",
          "Non puoi acquistare i prodotti del tuo negozio: rimuovili dal carrello.",
          403
        );
      }
    }
  }

  // ── PRE-FLIGHT per METODO (fail-closed, come /api/cliente/ordini F1) ────
  // B2 — per carta/klarna/bonifico_istantaneo il percorso è STRIPE e la disponibilità
  // è PER-METODO (metodo attivato + capability Stripe ACTIVE per klarna/
  // bonifico_istantaneo). OGNI negozio del carrello deve
  // avere il metodo disponibile: altrimenti rifiuta PRIMA di creare
  // qualunque intento (mai ordini orfani). Bonifico → nessun check.
  const providerRichiesto =
    modalita === "spedizione" ? providerDaMetodoPagamento(spedizioneRaw.metodoPagamento) : null;
  if (providerRichiesto) {
    const metodoRichiesto = String(spedizioneRaw.metodoPagamento);
    for (const gruppo of raggruppamento.negozi) {
      const pronta = await isMetodoDisponibile(gruppo.negozioId, metodoRichiesto);
      if (!pronta) {
        return apiError(
          codiceNonDisponibile(providerRichiesto, metodoRichiesto),
          messaggioNonDisponibile(providerRichiesto, metodoRichiesto),
          422
        );
      }
    }
  }

  // ── P1 PAYMENT-FIRST — metodi ONLINE: un INTENTO per gruppo negozio ────
  // I metodi online Stripe NON creano ordini prima del pagamento:
  // per ogni negozio del carrello la RPC checkout_intento_crea valida e
  // RISERVA SOLO lo stock di quel gruppo (quantita_riservata), creando una
  // sessione con ordine_id = NULL. La risposta riusa il contratto `ordini[]`
  // esistente (il client reindirizza via pagamento.redirectUrl e mostra
  // totale/negozio): ogni voce è l'INTENTO del gruppo, NON un ordine. Se la
  // sessione provider di un gruppo fallisce → intento annullato (riserva
  // rilasciata), errore per negozio, gli altri gruppi restano validi.
  if (providerRichiesto) {
    const intenti: OrdineCarrelloNegozio[] = [];
    const erroriIntenti: ErroreNegozio[] = [];
    for (const gruppo of raggruppamento.negozi) {
      const intento = await creaIntentoCheckout(
        costruisciPayloadIntentoCheckout({
          checkoutKey: chiavePerNegozio(checkoutKey, gruppo.negozioId),
          provider: providerRichiesto,
          // Gli intenti online esistono SOLO per la modalità spedizione.
          modalita: "spedizione",
          righe: gruppo.righe,
          cliente: {
            nome: typeof clienteRaw.nome === "string" ? clienteRaw.nome : "",
            cognome: typeof clienteRaw.cognome === "string" ? clienteRaw.cognome : "",
            telefono:
              typeof clienteRaw.telefono === "string" ? clienteRaw.telefono : null,
            email: emailDestinataria,
          },
          clienteUserId: utenteAutenticato?.id ?? null,
          clienteIp: ip,
          spedizione: {
            indirizzo:
              typeof spedizioneRaw.indirizzo === "string" ? spedizioneRaw.indirizzo : "",
            cap: typeof spedizioneRaw.cap === "string" ? spedizioneRaw.cap : "",
            citta: typeof spedizioneRaw.citta === "string" ? spedizioneRaw.citta : "",
            provincia:
              typeof spedizioneRaw.provincia === "string" ? spedizioneRaw.provincia : "",
            note: typeof spedizioneRaw.note === "string" ? spedizioneRaw.note : null,
            carrier: carrier as string,
            servizio: servizio as string,
            metodoPagamento: String(spedizioneRaw.metodoPagamento),
          },
          fatturazione: parseFatturazioneRaw(body.fatturazione),
          note: typeof body.note === "string" ? body.note : null,
        })
      );
      if (!intento.ok) {
        erroriIntenti.push({
          negozioId: gruppo.negozioId,
          codice: intento.codice,
          messaggio: intento.errore,
        });
        continue;
      }

      const sessione = await creaSessionePagamentoPerIntento(
        intento.checkoutId,
        providerRichiesto
      );
      if (!sessione.ok) {
        // Riserva rilasciata: nessun ordine, nessuna riserva fantasma.
        await annullaIntentoCheckout(intento.checkoutId).catch(() => {});
        erroriIntenti.push({
          negozioId: gruppo.negozioId,
          codice: sessione.codice,
          messaggio: sessione.errore,
        });
        continue;
      }

      intenti.push({
        ordineId: intento.checkoutId,
        numero: intento.checkoutId.slice(0, 8).toUpperCase(),
        stato: "in_attesa_pagamento",
        totale: intento.totale,
        paymentStatus: null,
        paymentProvider: providerRichiesto,
        giaEsistente: intento.giaEsistente,
        negozioId: intento.negozioId,
        negozioNome: intento.negozioNome,
        createdAt: new Date().toISOString(),
        modalita: "spedizione",
        righe: [],
        pagamento: {
          redirectUrl: sessione.redirectUrl,
          sessioneId: sessione.sessioneId,
          giaEsistente: sessione.giaEsistente,
        },
      });
    }

    // Almeno un intento REALMENTE nuovo → 201; tutti già esistenti (retry) → 200.
    const almenoNuovo = intenti.some((i) => !i.giaEsistente);
    const response = apiOk(
      {
        checkoutKey,
        ordini: intenti,
        errori: erroriIntenti,
      },
      almenoNuovo ? 201 : 200
    );
    if (!utenteAutenticato) {
      for (const intento of intenti) {
        if (intento.ordineId) setOrderAccessCookie(response, intento.ordineId);
      }
    }
    return response;
  }

  // ── BONIFICO / RITIRO — comportamento INVARIATO: ordini creati subito ──
  // Nessun gateway: le RPC esistenti creano un ordine per negozio con le
  // notifiche attuali. Nessuna sessione provider (mai un gateway per questi
  // metodi).
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
            metodoPagamento: vuoleBonificoDiretto
              ? "bonifico_diretto_venditore"
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

  // Almeno un ordine REALMENTE nuovo → 201; tutti già esistenti (retry) → 200.
  const almenoNuovo = esito.ordini.some((o) => !o.giaEsistente);
  let ordiniRisposta = esito.ordini;
  if (vuoleBonificoDiretto) {
    const db = createAdminSupabaseClient();
    for (const ordine of ordiniRisposta) {
      const { data: statoPagamento, error: statoErrore } = await db.rpc("aggiorna_payment_status", {
        p_ordine_id: ordine.ordineId,
        p_nuovo_stato: "pending",
        p_importo: ordine.totale,
        p_valuta: "EUR",
      });
      if (statoErrore || !(statoPagamento as { ok?: boolean } | null)?.ok) {
        return apiError(
          "PAYMENT_STATUS_INIT_FAILED",
          "Impossibile inizializzare lo stato del pagamento dell'ordine.",
          500
        );
      }
    }
    ordiniRisposta = ordiniRisposta.map((ordine) => ({
      ...ordine,
      paymentStatus: "pending",
      paymentProvider: null,
    }));
  }

  const response = apiOk(
    {
      checkoutKey: esito.checkoutKey,
      ordini: ordiniRisposta,
      errori: esito.errori,
      ...(vuoleBonificoDiretto && datiBonificoDiretto && ordiniRisposta[0]
        ? {
            bonificoDiretto: {
              venditoreNome: ordiniRisposta[0].negozioNome,
              intestatarioConto: datiBonificoDiretto.bankAccountName,
              banca: datiBonificoDiretto.bankName,
              iban: datiBonificoDiretto.iban,
              bicSwift: datiBonificoDiretto.bicSwift,
              importo: ordiniRisposta[0].totale,
              causale: null,
            },
          }
        : {}),
    },
    almenoNuovo ? 201 : 200
  );
  if (!utenteAutenticato) {
    for (const ordine of esito.ordini) {
      if (ordine.ordineId) setOrderAccessCookie(response, ordine.ordineId);
    }
  }
  return response;
}
