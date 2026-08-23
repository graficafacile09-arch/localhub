import { permanentRedirect } from "next/navigation";

export const metadata = {
  title: "Incassi — LocalHub",
};

/**
 * Gli Incassi sono stati accorpati nella nuova pagina "Guadagni"
 * (/merchant/[negozioId]/guadagni), unica destinazione per la parte
 * economica del negozio (rendiconto incassi + payout). Redirect permanente
 * per non spezzare vecchi link e segnalibri.
 */
export default async function MerchantIncassiLegacyPage({
  params,
}: {
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  permanentRedirect(`/merchant/${negozioId}/guadagni`);
}
