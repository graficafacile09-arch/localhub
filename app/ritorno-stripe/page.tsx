import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowLeft, CreditCard } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/session";
import { canManageStore } from "@/lib/merchant/data";
import { getStripeConnectAccount } from "@/lib/pagamenti/config";
import { getStripeAccountOnboarding } from "@/lib/pagamenti/stripe-connect";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * /ritorno-stripe — pagina di ritorno dal portale di onboarding Stripe.
 *
 * Stripe reindirizza qui il venditore quando completa (return_url) o lascia
 * (refresh_url) l'onboarding hosted. La pagina verifica la proprietà del
 * negozio (canManageStore), legge lo stato di onboarding dal DB e, quando
 * possibile, lo stato LIVE da Stripe (account.retrieve) per mostrare un esito
 * affidabile anche prima che il webhook `account.updated` arrivi.
 *
 * query params:
 *   - negozio_id  (obbligatorio)
 *   - refresh=1   → l'utente è arrivato dal refresh_url (link scaduto/ripresa).
 */
export default async function RitornoStripePage({
  searchParams,
}: {
  searchParams: Promise<{ negozio_id?: string; refresh?: string }>;
}) {
  const sp = await searchParams;
  const negozioId = (sp.negozio_id ?? "").trim();

  if (!negozioId) {
    return (
      <Shell
        icon={<AlertCircle className="h-5 w-5" />}
        tone="errore"
        titolo="Parametro mancante"
        testo="Non è stato specificato il negozio. Torna ai pagamenti del tuo negozio."
      />
    );
  }

  const user = await requireCurrentUser("/login");
  const puòGestire = await canManageStore(user.id, negozioId);
  if (!puòGestire) {
    return (
      <Shell
        icon={<AlertCircle className="h-5 w-5" />}
        tone="errore"
        titolo="Accesso negato"
        testo="Non puoi gestire il collegamento Stripe di questo negozio."
      />
    );
  }

  // Stato dal DB (fonte: webhook account.updated / crea).
  const locale = await getStripeConnectAccount(negozioId);

  // Stato LIVE da Stripe (best-effort: se la chiamata fallisce si usa il DB).
  let liveStatus: "pending" | "complete" | "restricted" | null = null;
  let livePayouts = false;
  let liveCharges = false;
  if (locale) {
    try {
      const live = await getStripeAccountOnboarding(locale.accountId);
      liveStatus = live.status;
      livePayouts = live.payoutsEnabled;
      liveCharges = live.chargesEnabled;
    } catch {
      // Nessuna info live: si ripiega sullo stato persistito.
    }
  }

  const effettivo: "pending" | "complete" | "restricted" =
    liveStatus ?? (locale?.onboardingStatus === "restricted" ? "restricted" : locale?.onboardingStatus === "complete" ? "complete" : "pending");
  const refresh = sp.refresh === "1";

  // Persisti nel DB lo stato LIVE restituito da Stripe (RPC già esistente):
  // per gli account creati via API V2 l'evento account.updated non arriva al
  // webhook classico, quindi senza questa scrittura il DB resterebbe fermo a
  // "pending" e sia il badge dei pagamenti sia il gating checkout (fail-closed)
  // non vedrebbero l'onboarding completato. Solo con esito LIVE valido; se la
  // scrittura fallisce la pagina continua a mostrare lo stato live corretto.
  if (locale && liveStatus) {
    try {
      const db = createAdminSupabaseClient();
      const { error: saveErr } = await db.rpc("pagamenti_stripe_connect_stato_salva", {
        p_account_id: locale.accountId,
        p_onboarding_status: liveStatus,
        p_payouts_enabled: livePayouts,
        p_charges_enabled: liveCharges,
      });
      if (saveErr) {
        console.error(`[ritorno-stripe] salvataggio stato account ${locale.accountId} fallito: ${saveErr.message}`);
      }
    } catch (e) {
      console.error(`[ritorno-stripe] salvataggio stato account ${locale.accountId} fallito:`, e);
    }
  }

  if (!locale) {
    return (
      <Shell
        icon={<CreditCard className="h-5 w-5" />}
        tone="neutro"
        titolo="Nessun account collegato"
        testo="Non risulta un account Stripe collegato a questo negozio."
        negozioId={negozioId}
      />
    );
  }

  if (effettivo === "complete") {
    return (
      <Shell
        icon={<CheckCircle2 className="h-5 w-5" />}
        tone="ok"
        titolo="Conto configurato con successo"
        testo={
          livePayouts
            ? "Il tuo conto Stripe è attivo: puoi ricevere pagamenti e incassi."
            : "Il tuo conto Stripe è collegato e può ricevere pagamenti."
        }
        dettaglio={`Account: ${locale.accountName || locale.accountId}`}
        negozioId={negozioId}
      />
    );
  }

  if (effettivo === "restricted") {
    return (
      <Shell
        icon={<AlertCircle className="h-5 w-5" />}
        tone="errore"
        titolo="Account con restrizioni"
        testo="Stripe ha segnalato una restrizione sul tuo account. Accedi al portale Stripe per verificare i requisiti."
        dettaglio={`Account: ${locale.accountName || locale.accountId}`}
        negozioId={negozioId}
      />
    );
  }

  return (
    <Shell
      icon={<AlertCircle className="h-5 w-5" />}
      tone="neutro"
      titolo={refresh ? "Onboarding non completato" : "Onboarding incompleto"}
      testo="Il tuo conto Stripe è in fase di configurazione: completa la verifica dei documenti e dell'IBAN per attivare gli incassi."
      dettaglio={`Account: ${locale.accountName || locale.accountId}`}
      negozioId={negozioId}
    />
  );
}

function Shell({
  icon,
  tone,
  titolo,
  testo,
  dettaglio,
  negozioId,
}: {
  icon: React.ReactNode;
  tone: "ok" | "errore" | "neutro";
  titolo: string;
  testo: string;
  dettaglio?: string;
  negozioId?: string;
}) {
  const toneClasses =
    tone === "ok"
      ? "bg-blue-50 text-blue-700"
      : tone === "errore"
        ? "bg-red-50 text-red-600"
        : "bg-slate-100 text-slate-600";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-10">
      <div className="w-full rounded-[2rem] border border-white/70 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Stripe Connect
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{titolo}</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">{testo}</p>
            {dettaglio && (
              <p className="mt-2 font-mono text-[11px] text-slate-400">{dettaglio}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
          {negozioId && (
            <Link
              href={`/merchant/${negozioId}/pagamenti`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <CreditCard className="h-4 w-4" />
              Vai ai pagamenti
            </Link>
          )}
          <Link
            href="/merchant"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Area venditore
          </Link>
        </div>
      </div>
    </main>
  );
}
