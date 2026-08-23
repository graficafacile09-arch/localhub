import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Payout — LocalHub",
};

/**
 * I Payout sono stati accorpati nella nuova pagina "Guadagni"
 * (/merchant/[negozioId]/guadagni), unica destinazione per la parte
 * economica del negozio (rendiconto incassi + payout). Redirect permanente
 * per non spezzare vecchi link e segnalibri.
 */
export default async function MerchantPayoutLegacyPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  permanentRedirect(`/merchant/${negozioId}/guadagni`);
}
