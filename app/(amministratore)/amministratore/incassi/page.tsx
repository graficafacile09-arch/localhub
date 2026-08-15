import IncassiClient from "@/components/incassi/IncassiClient";

export const metadata = {
  title: "Incassi — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Rendicontazione INCASSI dell'Area Amministratore: riepilogo globale
 * (GMV, commissioni, rimborsi, netto venditori) + elenco dettagliato con
 * filtri SERVER-SIDE (periodo, negozio, provider, stato). L'accesso è
 * garantito dal layout amministratore (area "admin" risolta server-side)
 * e dalla RLS admin sulle letture. Nessun calcolo economico lato client:
 * tutto arriva dall'API protetta /api/amministratore/incassi.
 */
export default function AdminIncassiPage() {
  return (
    <IncassiClient
      apiUrl="/api/amministratore/incassi"
      dettaglioBase="/amministratore/ordini"
      admin
      caricaNegozi
      intestazione="Pannello Amministratore"
    />
  );
}
