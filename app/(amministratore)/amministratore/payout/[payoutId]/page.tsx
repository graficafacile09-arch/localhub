import PayoutAdminDetailClient from "@/components/amministratore/payout/PayoutAdminDetailClient";

export const metadata = {
  title: "Dettaglio payout — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Dettaglio payout (admin): riepilogo economico, ordini inclusi e azioni di
 * stato (segna in erogazione / segna pagato / annulla). Le azioni passano
 * dalle RPC service-role (payout_segna_erogato / payout_annulla) con
 * macchina a stati validata lato server; nessuna chiamata Stripe in V1.
 */
export default async function AdminPayoutDetailPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  return <PayoutAdminDetailClient payoutId={payoutId} />;
}
