import type { ReactNode } from "react";
import AdminShell from "@/components/amministratore/AdminShell";

export const metadata = {
  title: "Amministratore — InCittà",
  description:
    "Pannello di amministrazione di LocalHub: gestione di attività, prodotti, contenuti e piattaforma.",
};

/**
 * Layout indipendente dell'area Amministratore.
 * Solo struttura UI e navigazione: nessuna logica, query o permessi.
 */
export default function AmministratoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
