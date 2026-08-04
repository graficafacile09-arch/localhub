import CestinoModule from "@/components/amministratore/CestinoModule";

export const metadata = {
  title: "Cestino — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Cestino GLOBALE della piattaforma — funzione di amministrazione.
 * I commercianti possono eliminare il proprio negozio, ma il ripristino
 * (e la gestione del cestino) è esclusivamente dell'amministratore.
 */
export default function CestinoPage() {
  return <CestinoModule />;
}
