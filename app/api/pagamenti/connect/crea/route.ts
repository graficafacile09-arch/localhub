import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { getStripeConnectAccount } from "@/lib/pagamenti/config";
import {
  createStripeExpressAccount,
  createStripeAccountLink,
} from "@/lib/pagamenti/stripe-connect";

/**
 * POST /api/pagamenti/connect/crea
 *
 * Inizializza (o riprende) l'onboarding Stripe Connect EXPRESS per il negozio:
 *   1. se il negozio ha già un connected account → riusa quello;
 *   2. altrimenti crea un account Express via API (stripe.accounts.create)
 *      e lo salva (RPC `pagamenti_stripe_connect_crea`, stato = pending);
 *   3. genera un Account Link di onboarding (stripe.accountLinks.create) e
 *      restituisce l'URL hosted a cui reindirizzare il browser del venditore.
 *
 * Body atteso (JSON): { "negozioId": "<uuid>" }.
 * NESSUN secret viene richiesto al venditore: Stripe gestisce creazione
 * account, KYC e IBAN nel suo portale hosted. Al termine Stripe reindirizza
 * su /ritorno-stripe (return_url) e notifica i progressi con `account.updated`
 * verso /api/pagamenti/connect/webhook.
 */
export async function POST(request: Request) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  // negozioId dal body JSON (con fallback query param per compatibilità).
  let negozioId: string | null = null;
  try {
    const body = (await request.json()) as { negozioId?: unknown };
    if (typeof body.negozioId === "string" && body.negozioId.trim()) {
      negozioId = body.negozioId.trim();
    }
  } catch {
    // body non JSON → si prova con il query param.
  }
  if (!negozioId) {
    const url = new URL(request.url);
    negozioId = url.searchParams.get("negozioId");
  }
  if (!negozioId) {
    return apiError("VALIDATION_ERROR", "negozioId mancante.", 422);
  }

  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  try {
    // Nome business del negozio per il prefill dell'account Express.
    const db = createAdminSupabaseClient();
    const { data: store } = await db
      .from("negozi")
      .select("nome")
      .eq("id", negozioId)
      .maybeSingle();
    const businessName = store?.nome ? String(store.nome).trim() : null;

    // 1. Account collegato esistente → riusa (genera un nuovo link per
    //    riprendere l'onboarding). Altrimenti crea un account Express nuovo.
    let accountId: string;
    const esistente = await getStripeConnectAccount(negozioId);
    if (esistente) {
      accountId = esistente.accountId;
    } else {
      const creato = await createStripeExpressAccount({
        email: user.email ?? null,
        businessName,
      });
      accountId = creato.accountId;

      const { error } = await db.rpc("pagamenti_stripe_connect_crea", {
        p_negozio_id: negozioId,
        p_account_id: accountId,
        p_account_name: businessName,
        p_test_mode: !creato.livemode,
      });
      if (error) {
        console.error(`[connect-crea] salvataggio account ${accountId}: ${error.message}`);
        return apiError("SAVE_FAILED", "Impossibile salvare il collegamento Stripe.", 500);
      }
    }

    // 2. Account Link di onboarding (single-use, redirect al portale Stripe).
    const siteUrl = getSiteUrl();
    const base = `/ritorno-stripe?negozio_id=${encodeURIComponent(negozioId)}`;
    const url = await createStripeAccountLink(
      accountId,
      `${siteUrl}${base}`,
      `${siteUrl}${base}&refresh=1`
    );

    return apiOk({ url, accountId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    console.error(`[connect-crea] onboarding non avviato: ${msg}`);
    return apiError(
      "STRIPE_CONNECT_NON_CONFIGURATO",
      "Stripe Connect non è configurato a livello di piattaforma.",
      500
    );
  }
}
