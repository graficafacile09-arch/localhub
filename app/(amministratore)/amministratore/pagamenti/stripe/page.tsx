import StripeConnectAdminClient from "@/components/amministratore/pagamenti/StripeConnectAdminClient";

export const metadata = {
  title: "Stripe Connect — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Pagina "Pagamenti → Stripe Connect" dell'Area Amministratore.
 *
 * Supervisione dei connected account Stripe dei negozi: stato onboarding,
 * charges/payouts abilitati, verifica live dello stato e riapertura
 * dell'Account Link. L'accesso è garantito dal layout amministratore
 * (area "admin" risolta server-side) e da requireApiArea("admin") sulle
 * API. Nessun dato sensibile/credenziale viene caricato o mostrato:
 * la pagina legge solo lo stato pubblico del collegamento.
 */
export default function AdminStripeConnectPage() {
  return <StripeConnectAdminClient />;
}