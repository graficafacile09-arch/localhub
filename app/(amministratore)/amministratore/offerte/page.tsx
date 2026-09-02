import OfferteModule from "@/components/amministratore/OfferteModule";
import { getNegoziPerOffertaAdmin, getOfferteAdmin } from "@/lib/offerte";

export const metadata = {
  title: "Offerte — Amministratore",
};

// I dati reali delle offerte devono riflettere lo stato corrente del database.
export const dynamic = "force-dynamic";

export default async function OffertePage() {
  const [offerte, negozi] = await Promise.all([
    getOfferteAdmin(),
    getNegoziPerOffertaAdmin(),
  ]);
  return <OfferteModule offerte={offerte} negozi={negozi} />;
}
