import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import ClienteShell from "@/components/cliente/ClienteShell";
import AreaNonAutorizzata from "@/components/auth/AreaNonAutorizzata";
import { areaToPath } from "@/lib/auth/area";
import { getSessionArea } from "@/lib/auth/session-area";
import { isAccountSupervisione } from "@/lib/auth/roles";
import { getOrdiniCliente } from "@/lib/cliente/ordini";
import { filtraOrdiniCliente } from "@/lib/cliente/ordini-format";
import type { OrdineClienteLista } from "@/lib/cliente/types";

export const metadata = {
  title: "Area Clienti — LocalHub",
  description:
    "La tua area personale su LocalHub: ordini, preferiti, profilo e impostazioni.",
};

/**
 * Layout dell'Area Clienti.
 * L'accesso è determinato dall'AREA ATTIVA della sessione (cookie httpOnly
 * lh_area), scelta al login e fissa per tutta la sessione: entra SOLO chi ha
 * una sessione "cliente". Chi ha una sessione di un'altra area viene sempre
 * reindirizzato alla propria area — anche se l'account possiede più ruoli.
 */
export default async function ClienteLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Helper centrale: l'area attiva della sessione determina l'accesso.
  const sessione = await getSessionArea();
  if (!sessione) redirect("/login?area=cliente");

  // Solo la sessione "cliente" entra in /cliente. Gli altri vedono l'avviso
  // rosso "Area non autorizzata" (sessione intatta, nessun logout) — eccetto
  // l'account di supervisione, che conserva il comportamento storico.
  if (sessione.area !== "cliente") {
    if (isAccountSupervisione(sessione.user.email ?? "", sessione.ruoli)) {
      redirect(areaToPath(sessione.area));
    }
    return <AreaNonAutorizzata areaUtente={sessione.area} />;
  }

  // Badge "Ordini [N]" del menu: conteggio degli ordini IN CORSO (dati
  // reali da Supabase, best-effort — un errore non deve bloccare l'area).
  let ordiniInCorso = 0;
  try {
    const ordini: OrdineClienteLista[] = await getOrdiniCliente(sessione.user.id);
    ordiniInCorso = filtraOrdiniCliente(ordini, "in_corso").length;
  } catch {
    ordiniInCorso = 0;
  }

  return (
    <ClienteShell ordiniInCorso={ordiniInCorso}>{children}</ClienteShell>
  );
}
