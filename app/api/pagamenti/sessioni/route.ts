import { apiError, apiOk } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { orderAccessCookieName } from "@/lib/cliente/order-access";
import {
  caricaIntentoRetry,
  creaSessionePagamentoPerIntento,
  creaSessionePagamentoPerOrdine,
  elaboraPagamentiScaduti,
  intentoAutorizzato,
} from "@/lib/pagamenti/sessioni";
import { isProviderGatewayAmmesso } from "@/lib/pagamenti/registry";

/** Token guest scoped al checkout: header Authorization Bearer oppure cookie. */
async function tokenCheckout(request: Request, checkoutId: string): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (bearer) return bearer;
  return (await cookies()).get(orderAccessCookieName(checkoutId))?.value ?? null;
}

/**
 * POST /api/pagamenti/sessioni
 *
 * Crea (o riusa) la sessione di pagamento per un checkout GIÀ esistente.
 *
 * DUE CONTRATTI:
 *
 * 1) PAYMENT-FIRST — body { checkoutId }: checkoutId è l'id della SESSIONE
 *    (pagamenti_sessioni.id), l'intento creato dalla P1 con ordine_id = NULL.
 *    Il retry NON è più legato a un ordine (che per gli online NON esiste
 *    ancora): riusa la sessione provider attiva o ne crea una nuova sullo
 *    STESSO intento, con il provider autoritativo dell'intento. MAI un
 *    ordine, MAI una nuova riserva stock, MAI notifiche. Guardie di stato:
 *    - ordine_id valorizzato (pagamento già confermato) → nessun nuovo
 *      pagamento, si restituisce l'ordine esistente;
 *    - created/pending → retry (riuso/creazione sessione provider);
 *    - expired/refunded/failed/canceled → nessun retry, nessun ordine.
 *
 * 2) LEGACY — body { ordineId }: ordine già esistente in attesa di pagamento
 *    (bonifico/ritiro e sessioni storiche), invariato: usa ESATTAMENTE il
 *    provider originario dell'ordine, mai un fallback a Stripe.
 *
 * L'importo è SEMPRE letto dal DB (ordine.totale / checkout_payload): nessun
 * valore dal client. Accesso: legacy pubblico come il checkout (UUID non
 * indovinabile); payment-first → proprietario autenticato OPPURE token guest
 * firmato e scoped al checkout. Guardie server-side: pagato/concluso/scaduto
 * → rifiutato senza nuovo pagamento.
 */
export async function POST(request: Request) {
  let body: { ordineId?: unknown; checkoutId?: unknown };
  try {
    body = (await request.json()) as { ordineId?: unknown; checkoutId?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const checkoutId =
    typeof body.checkoutId === "string" && body.checkoutId.trim()
      ? body.checkoutId.trim()
      : "";
  const ordineId =
    typeof body.ordineId === "string" && body.ordineId.trim()
      ? body.ordineId.trim()
      : "";

  if (!checkoutId && !ordineId) {
    return apiError("VALIDATION_ERROR", "Ordine o checkout non valido.", 422);
  }

  // Sweep best-effort prima di procedere (consistenza eventuale scadenze).
  await elaboraPagamentiScaduti().catch(() => {});

  // ── RETRY PAYMENT-FIRST: checkoutId = pagamenti_sessioni.id ─────────────
  if (checkoutId) {
    const intento = await caricaIntentoRetry(checkoutId);
    if (!intento) {
      return apiError("CHECKOUT_NON_TROVATO", "Checkout non trovato.", 404);
    }

    // Autorizzazione: proprietario autenticato (clienteUserId dello snapshot)
    // OPPURE token guest firmato e scoped a questo checkout. Fail-closed.
    const utente = await getCurrentUser();
    const token = await tokenCheckout(request, checkoutId);
    const autorizzato = await intentoAutorizzato(checkoutId, {
      userId: utente?.id ?? null,
      token: utente ? null : token,
    });
    if (!autorizzato) {
      return apiError("CHECKOUT_NON_TROVATO", "Checkout non trovato.", 404);
    }

    // Già confermato (P2: l'ordine è stato creato dopo il pagamento): nessun
    // nuovo pagamento, nessun addebito duplicato.
    if (intento.ordineId) {
      return apiOk({ giaConfermato: true, ordineId: intento.ordineId });
    }

    // Macchina stati: solo un intento ATTIVO è pagabile.
    if (!["created", "pending"].includes(intento.status)) {
      return apiError(
        "CHECKOUT_NON_DISPONIBILE",
        "Questo checkout non è più pagabile: nessun importo è stato addebitato.",
        410
      );
    }

    // Provider autoritativo dell'intento (mai dal client) — fail-closed.
    if (!isProviderGatewayAmmesso(intento.provider)) {
      return apiError(
        "PAGAMENTO_NON_DISPONIBILE",
        "Questo checkout non ha un pagamento online da riprovare.",
        422
      );
    }

    // MAI un ordine, MAI una riserva, MAI notifiche: la riserva originale
    // resta quella del checkout; la sessione provider attiva NON scaduta
    // viene riusata (idempotenza doppio click) o ricreata sullo stesso
    // intento (creaSessionePagamentoPerIntento legge il payload dal DB).
    const esito = await creaSessionePagamentoPerIntento(checkoutId, intento.provider);
    if (!esito.ok) {
      const status = esito.codice === "CHECKOUT_NON_TROVATO" ? 404 : 422;
      return apiError(esito.codice, esito.errore, status);
    }

    return apiOk({
      pagamento: {
        redirectUrl: esito.redirectUrl,
        sessioneId: esito.sessioneId,
        giaEsistente: esito.giaEsistente,
      },
    });
  }

  // ── RETRY LEGACY: ordineId → ordine GIÀ esistente ──────────────────────
  const db = createAdminSupabaseClient();

  // ── Provider originario dell'ordine (mai dal client) ──────────────────
  const { data: ordine } = await db
    .from("ordini")
    .select("payment_provider")
    .eq("id", ordineId)
    .maybeSingle();
  if (!ordine) {
    return apiError("ORDINE_NON_TROVATO", "Ordine non trovato.", 404);
  }

  let provider = ordine.payment_provider ? String(ordine.payment_provider).trim() : "";

  // Ordini legacy (sessioni create prima della valorizzazione di
  // payment_provider): il vero provider è quello della sessione salvata.
  if (!provider) {
    const { data: sessione } = await db
      .from("pagamenti_sessioni")
      .select("provider")
      .eq("ordine_id", ordineId)
      .order("created_at", { ascending: false })
      .limit(1);
    provider = sessione?.[0]?.provider ? String(sessione[0].provider).trim() : "";
  }

  // Fail-closed: senza un provider online valido (bonifico o ignoto) nessuna
  // sessione gateway viene creata — mai un fallback automatico a Stripe.
  if (!isProviderGatewayAmmesso(provider)) {
    return apiError(
      "PAGAMENTO_NON_DISPONIBILE",
      "Questo ordine non ha un pagamento online da riprovare.",
      422
    );
  }

  const esito = await creaSessionePagamentoPerOrdine(ordineId, provider);
  if (!esito.ok) {
    const status = esito.codice === "ORDINE_NON_TROVATO" ? 404 : 422;
    return apiError(esito.codice, esito.errore, status);
  }

  return apiOk({
    pagamento: {
      redirectUrl: esito.redirectUrl,
      sessioneId: esito.sessioneId,
      giaEsistente: esito.giaEsistente,
    },
  });
}