/**
 * PAGAMENTI — STRIPE CONNECT AREA AMMINISTRATORE (supervisione).
 *
 * Vista unica dei connected account dei negozi per l'amministrazione:
 *   - elenco negozi + stato collegamento (sola lettura, RLS admin);
 *   - verifica/aggiornamento dello stato onboarding via Stripe (LIVE);
 *   - generazione/riapertura dell'Account Link di onboarding per un negozio.
 *
 * RIUSO del codice esistente (nessuna seconda implementazione di Stripe
 * Connect):
 *   - lib/pagamenti/stripe-connect.ts (createStripeExpressAccount,
 *     createStripeAccountLink, getStripeAccountOnboarding);
 *   - RPC service-role esistenti: pagamenti_stripe_connect_crea,
 *     pagamenti_stripe_connect_stato_salva.
 *
 * Il modello Stripe NON cambia: la piattaforma resta proprietaria delle
 * credenziali (env), ogni negozio ha il proprio connected account, i
 * pagamenti restano direct charge. L'admin NON sostituisce il KYC: genera
 * solo il collegamento/Account Link, la verifica dei dati avviene nel
 * portale hosted Stripe da parte del negoziante.
 *
 * Sicurezza: tutte le route che usano questo servizio passano da
 * requireApiArea("admin"). Nessun secret/token esposto: qui si leggono e
 * si scrivono SOLO campi pubblici (account_id, account_name, stato
 * onboarding, charges/payouts). Nessuna credenziale merchant.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import {
  createStripeAccountLink,
  createStripeExpressAccount,
  getStripeAccountOnboarding,
} from "@/lib/pagamenti/stripe-connect";

/** Stato complessivo mostrato all'admin per ogni negozio. */
export type StatoCollegamentoStripe =
  | "NON_COLLEGATO"
  | "ONBOARDING"
  | "RESTRICTED"
  | "ATTIVO";

/** Riga della vista admin: negozio + stato del suo connected account. */
export type NegozioStripeConnectAdmin = {
  id: string;
  nome: string;
  categoria: string | null;
  attivo: boolean;
  accountPresente: boolean;
  accountId: string | null;
  accountName: string | null;
  testMode: boolean;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Capability Stripe reale (active → true, fail-closed). */
  klarnaEnabled: boolean;
  statoComplessivo: StatoCollegamentoStripe;
  aggiornatoAt: string | null;
};

/** Riepilogo aggregato per i KPI della pagina. */
export type RiepilogoStripeConnectAdmin = {
  totaleNegozi: number;
  collegati: number;
  attivi: number;
  onboarding: number;
  restricted: number;
  nonCollegati: number;
};

export type ElencoStripeConnectAdmin = {
  riepilogo: RiepilogoStripeConnectAdmin;
  negozi: NegozioStripeConnectAdmin[];
};

type NegozioRow = Record<string, unknown>;
type PagamentiRow = Record<string, unknown>;

function mappaStato(
  accountPresente: boolean,
  onboardingStatus: string,
  chargesEnabled: boolean,
  payoutsEnabled: boolean
): StatoCollegamentoStripe {
  if (!accountPresente) return "NON_COLLEGATO";
  if (onboardingStatus === "restricted") return "RESTRICTED";
  if (onboardingStatus === "complete" && chargesEnabled && payoutsEnabled) {
    return "ATTIVO";
  }
  return "ONBOARDING";
}

function mappaNegozio(row: NegozioRow): NegozioStripeConnectAdmin {
  // Il join embedded `negozio_pagamenti` può essere: null (nessuna riga),
  // array vuoto, array con 1+ righe o oggetto singolo (shape del client
  // Supabase). Filtra SOLO le righe del provider stripe: le altre righe
  // del negozio non riguardano il collegamento Connect.
  const collegamenti = (Array.isArray(row.negozio_pagamenti)
    ? (row.negozio_pagamenti as PagamentiRow[])
    : row.negozio_pagamenti
      ? [row.negozio_pagamenti as PagamentiRow]
      : []).filter((p) => p.provider === "stripe");
  const primo = collegamenti[0] ?? null;

  const accountId = primo && typeof primo.account_id === "string" && primo.account_id.trim()
    ? primo.account_id.trim()
    : null;
  const accountPresente = !!accountId;
  const onboardingStatus = primo && typeof primo.onboarding_status === "string"
    ? primo.onboarding_status
    : "not_started";
  const chargesEnabled = primo?.charges_enabled === true;
  const payoutsEnabled = primo?.payouts_enabled === true;
  // B1 — flag capability dal DB (fonte: verifica live / webhook → RPC).
  const klarnaEnabled = primo?.klarna_enabled === true;

  return {
    id: String(row.id ?? ""),
    nome: String(row.nome ?? ""),
    categoria: typeof row.categoria === "string" && row.categoria.trim() ? row.categoria.trim() : null,
    attivo: row.attivo === true,
    accountPresente,
    accountId,
    accountName: primo && typeof primo.account_name === "string" && primo.account_name.trim()
      ? primo.account_name.trim()
      : null,
    testMode: primo?.test_mode !== false,
    onboardingStatus,
    chargesEnabled,
    payoutsEnabled,
    klarnaEnabled,
    statoComplessivo: mappaStato(accountPresente, onboardingStatus, chargesEnabled, payoutsEnabled),
    aggiornatoAt: primo && typeof primo.updated_at === "string" ? primo.updated_at : null,
  };
}

/**
 * Elenco GLOBALE dei negozi con lo stato del collegamento Stripe Connect.
 * Lettura con createServerSupabaseClient(): la policy RLS admin
 * ("negozio pagamenti admin select all") consente all'admin di vedere
 * TUTTE le righe. Include anche i negozi senza collegamento (stato
 * NON_COLLEGATO) per dare una vista completa.
 */
export async function getNegoziStripeConnectAdmin(): Promise<ElencoStripeConnectAdmin> {
  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from("negozi")
    .select(
      "id, nome, categoria, attivo, negozio_pagamenti(provider, attivo, test_mode, account_id, account_name, onboarding_status, charges_enabled, payouts_enabled, klarna_enabled, updated_at)"
    )
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(`Lettura negozi Stripe Connect fallita: ${error.message}`);
  }

  const negozi = ((data ?? []) as NegozioRow[])
    .map(mappaNegozio)
    .filter((n) => n.id);

  const riepilogo: RiepilogoStripeConnectAdmin = {
    totaleNegozi: negozi.length,
    collegati: 0,
    attivi: 0,
    onboarding: 0,
    restricted: 0,
    nonCollegati: 0,
  };
  for (const n of negozi) {
    if (n.statoComplessivo === "ATTIVO") riepilogo.attivi++;
    else if (n.statoComplessivo === "ONBOARDING") riepilogo.onboarding++;
    else if (n.statoComplessivo === "RESTRICTED") riepilogo.restricted++;
    else riepilogo.nonCollegati++;
    if (n.accountPresente) riepilogo.collegati++;
  }

  return { riepilogo, negozi };
}

/** Esito della verifica live dello stato onboarding di un negozio. */
export type EsitoVerificaStripeAdmin =
  | {
      ok: true;
      negozio: NegozioStripeConnectAdmin;
      live: boolean;
    }
  | { ok: false; codice: string; messaggio: string; status: number };

/**
 * Verifica lo stato LIVE dell'account Stripe Connect del negozio presso
 * Stripe (getStripeAccountOnboarding) e lo persiste con la RPC esistente
 * `pagamenti_stripe_connect_stato_salva` (idempotente per account_id).
 * Fail-closed: negozio senza connected account → 404; chiamata Stripe
 * fallita (env piattaforma assente, account non trovato, rete) → errore
 * senza scritture.
 */
export async function verificaStatoStripeAdmin(
  negozioId: string
): Promise<EsitoVerificaStripeAdmin> {
  const dbAdmin = createAdminSupabaseClient();
  const { data: riga, error: rigaError } = await dbAdmin
    .from("negozio_pagamenti")
    .select("account_id, account_name, test_mode, onboarding_status, charges_enabled, payouts_enabled, klarna_enabled, updated_at")
    .eq("negozio_id", negozioId)
    .eq("provider", "stripe")
    .eq("attivo", true)
    .maybeSingle();

  if (rigaError) {
    return { ok: false, codice: "FETCH_FAILED", messaggio: "Impossibile leggere il collegamento Stripe.", status: 500 };
  }
  const accountId =
    riga && typeof riga.account_id === "string" && riga.account_id.trim()
      ? riga.account_id.trim()
      : null;
  if (!accountId) {
    return {
      ok: false,
      codice: "NON_COLLEGATO",
      messaggio: "Il negozio non ha un connected account Stripe collegato.",
      status: 404,
    };
  }

  let statoLive;
  try {
    statoLive = await getStripeAccountOnboarding(accountId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    return {
      ok: false,
      codice: "STRIPE_ERROR",
      messaggio: `Verifica live non riuscita (${msg}). Riprova più tardi.`,
      status: 502,
    };
  }

  const { error: statoError } = await dbAdmin.rpc("pagamenti_stripe_connect_stato_salva", {
    p_account_id: accountId,
    p_onboarding_status: statoLive.status,
    p_payouts_enabled: statoLive.payoutsEnabled,
    p_charges_enabled: statoLive.chargesEnabled,
    // Persiste lo stato reale della capability Klarna letta da Stripe.
    p_klarna_enabled: statoLive.klarnaEnabled,
  });
  if (statoError) {
    return { ok: false, codice: "SAVE_FAILED", messaggio: "Stato verificato ma non salvabile.", status: 500 };
  }

  // Ricarica l'elenco e restituisce la riga aggiornata del negozio.
  const elenco = await getNegoziStripeConnectAdmin();
  const negozio = elenco.negozi.find((n) => n.id === negozioId);
  if (!negozio) {
    return { ok: false, codice: "NEGOZIO_NON_TROVATO", messaggio: "Negozio non trovato.", status: 404 };
  }
  return { ok: true, negozio, live: true };
}

/** Esito della generazione/riapertura dell'Account Link di onboarding. */
export type EsitoOnboardingStripeAdmin =
  | { ok: true; url: string; accountId: string; creato: boolean }
  | { ok: false; codice: string; messaggio: string; status: number };

/**
 * Genera (o riapre) l'Account Link di onboarding Stripe Connect per un
 * negozio, per conto dell'amministratore:
 *   - se il negozio ha già un connected account → riusa quello e genera un
 *     nuovo Account Link (single-use) per riprendere l'onboarding;
 *   - altrimenti crea un account Express via API (createStripeExpressAccount,
 *     stesso helper della route merchant) e lo salva con la RPC esistente
 *     `pagamenti_stripe_connect_crea` (stato = pending);
 *   - genera l'Account Link con return/refresh verso /ritorno-stripe.
 *
 * IMPORTANTE — il KYC NON viene sostituito: l'Account Link punta al portale
 * hosted Stripe e i dati (identità, azienda, IBAN, verifiche) restano a
 * carico del negoziante. L'URL va condiviso con il titolare del negozio.
 */
export async function avviaOnboardingStripeAdmin(
  negozioId: string,
  adminEmail: string | null
): Promise<EsitoOnboardingStripeAdmin> {
  const db = createAdminSupabaseClient();

  // Dati del negozio (nome per il prefill dell'account Express).
  const { data: negozio } = await db
    .from("negozi")
    .select("nome, email")
    .eq("id", negozioId)
    .maybeSingle();
  if (!negozio) {
    return { ok: false, codice: "NEGOZIO_NON_TROVATO", messaggio: "Negozio non trovato.", status: 404 };
  }
  const businessName = negozio.nome ? String(negozio.nome).trim() : null;

  // 1. Account già collegato → riusa; altrimenti crea + salva (RPC esistente).
  let accountId: string;
  let creato = false;
  const { data: esistente } = await db
    .from("negozio_pagamenti")
    .select("account_id")
    .eq("negozio_id", negozioId)
    .eq("provider", "stripe")
    .eq("attivo", true)
    .maybeSingle();
  const accountEsistente =
    esistente && typeof esistente.account_id === "string" && esistente.account_id.trim()
      ? esistente.account_id.trim()
      : null;

  if (accountEsistente) {
    accountId = accountEsistente;
  } else {
    let creatoStripe;
    try {
      creatoStripe = await createStripeExpressAccount({
        email: adminEmail ?? null,
        businessName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "errore sconosciuto";
      return {
        ok: false,
        codice: "STRIPE_ERROR",
        messaggio: `Creazione account Stripe non riuscita (${msg}).`,
        status: 502,
      };
    }
    accountId = creatoStripe.accountId;

    const { error: saveErr } = await db.rpc("pagamenti_stripe_connect_crea", {
      p_negozio_id: negozioId,
      p_account_id: accountId,
      p_account_name: businessName,
      p_test_mode: !creatoStripe.livemode,
    });
    if (saveErr) {
      return {
        ok: false,
        codice: "SAVE_FAILED",
        messaggio: "Account Stripe creato ma collegamento non salvabile.",
        status: 500,
      };
    }
    creato = true;
  }

  // 2. Account Link di onboarding (single-use, redirect al portale Stripe).
  const siteUrl = getSiteUrl();
  const base = `/ritorno-stripe?negozio_id=${encodeURIComponent(negozioId)}`;
  let url: string;
  try {
    url = await createStripeAccountLink(
      accountId,
      `${siteUrl}${base}`,
      `${siteUrl}${base}&refresh=1`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    return {
      ok: false,
      codice: "STRIPE_ERROR",
      messaggio: `Account Link non generato (${msg}).`,
      status: 502,
    };
  }

  return { ok: true, url, accountId, creato };
}