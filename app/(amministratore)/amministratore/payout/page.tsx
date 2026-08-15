import PayoutAdminClient from "@/components/amministratore/payout/PayoutAdminClient";

export const metadata = {
  title: "Payout — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Payout dell'Area Amministratore: supervisione globale dei payout interni
 * di tutti i negozi (calcolo per periodo, stato di erogazione, storico).
 * L'accesso è garantito dal layout amministratore (area "admin" risolta
 * server-side) e dalla RLS admin sulle letture; i filtri sono applicati
 * SERVER-SIDE dall'API protetta /api/amministratore/payout.
 */
export default function AdminPayoutPage() {
  return <PayoutAdminClient />;
}
