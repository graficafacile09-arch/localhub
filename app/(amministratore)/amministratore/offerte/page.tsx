import OfferteModule from "@/components/amministratore/OfferteModule";
import { getOfferteAdmin } from "@/lib/offerte";

export const metadata = {
  title: "Offerte — Amministratore",
};

// I dati reali delle offerte devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function OffertePage() {
  const offerte = await getOfferteAdmin();
  return <OfferteModule offerte={offerte} />;
}