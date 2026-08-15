import OrdiniAdminClient from "@/components/amministratore/ordini/OrdiniAdminClient";

export const metadata = {
  title: "Ordini — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Console ORDINI dell'Area Amministratore: elenco globale con ricerca, filtri
 * e paginazione SERVER-SIDE. L'accesso è garantito dal layout amministratore
 * (area "admin" risolta server-side) e, a valle, dalla RLS admin sulle letture.
 */
export default function AdminOrdiniPage() {
  return <OrdiniAdminClient />;
}
