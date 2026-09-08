import { apiError, apiOk } from "@/lib/api/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  creaSessionePagamentoPerOrdine,
  elaboraPagamentiScaduti,
} from "@/lib/pagamenti/sessioni";
import { isProviderGatewayAmmesso } from "@/lib/pagamenti/registry";

/**
 * POST /api/pagamenti/sessioni
 *
 * Crea (o riusa) la sessione di pagamento per un ordine GIÀ esistente in
 * attesa di pagamento (payment_status = pending/failed), usando ESATTAMENTE
 * il provider originario dell'ordine.
 * Usato dal pulsante "Riprova pagamento" della pagina di conferma ordine
 * quando l'utente ha abbandonato il pagamento senza completarlo.
 *
 * Il provider NON viene scelto dal client e NON c'è alcun fallback a Stripe:
 *   - fonte primaria: ordini.payment_provider (marcatore autoritativo
 *     impostato dall'orchestratore quando l'ordine è entrato nel flusso);
 *   - ordini legacy (payment_provider mai valorizzato): il provider si
 *     ricava dalla sessione più recente salvata in pagamenti_sessioni
 *     (registra il vero provider originale al momento della creazione);
 *   - senza provider online (bonifico / sconosciuto) → fail-closed, NESSUNA
 *     sessione gateway viene creata.
 *
 * L'importo è SEMPRE letto dal DB (ordine.totale): nessun valore dal client.
 * Accesso pubblico come il checkout (UUID dell'ordine non indovinabile);
 * guardie server-side: ordine pagato/concluso → rifiutato.
 */
export async function POST(request: Request) {
  let body: { ordineId?: unknown };
  try {
    body = (await request.json()) as { ordineId?: unknown };
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  const ordineId =
    typeof body.ordineId === "string" && body.ordineId.trim()
      ? body.ordineId.trim()
      : "";
  if (!ordineId) {
    return apiError("VALIDATION_ERROR", "Ordine non valido.", 422);
  }

  // Sweep best-effort prima di procedere (consistenza eventuale scadenze).
  await elaboraPagamentiScaduti().catch(() => {});

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
