import TestInvioOrdineClient from "@/components/amministratore/ordini/TestInvioOrdineClient";

export const metadata = {
  title: "Test invio ordine — Amministratore",
};

export const dynamic = "force-dynamic";

/**
 * Pagina "Ordini & Pagamenti → Test invio ordine" dell'Area Amministratore.
 *
 * Esegue la verifica end-to-end delle notifiche di un ordine (email,
 * WhatsApp, ntfy, notifica admin) SENZA creare ordini reali, SENZA
 * modificare lo stock e SENZA generare pagamenti. L'accesso è garantito
 * dal layout amministratore (area "admin" server-side) e da
 * requireApiArea("admin") sull'API. Il flusso payment-first cliente resta
 * intatto: questa pagina è uno strumento di diagnostica separato.
 */
export default function TestInvioOrdinePage() {
  return <TestInvioOrdineClient />;
}