import CestinoModule from "@/components/amministratore/CestinoModule";
import OrdiniCestinoSection from "@/components/amministratore/ordini/OrdiniCestinoSection";

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
  return (
    <>
      <CestinoModule />
      {/* Ordini nel Cestino: complemento della gestione ordini —
          "Elimina ordine" (soft delete) sposta qui l'ordine. */}
      <OrdiniCestinoSection />
    </>
  );
}
