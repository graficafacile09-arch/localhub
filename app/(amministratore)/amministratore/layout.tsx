import type { ReactNode } from "react";
import AdminShell from "@/components/amministratore/AdminShell";
import { getDatiAccount } from "@/components/Header/get-account-data";
import { requireRuoli } from "@/lib/auth/session";

export const metadata = {
  title: "Amministratore — InCittà",
  description:
    "Pannello di amministrazione di LocalHub: gestione di attività, prodotti, contenuti e piattaforma.",
};

/**
 * Layout dell'area Amministratore.
 * Accessibile SOLO agli utenti che possiedono il ruolo admin (multi-role).
 */
export default async function AmministratoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRuoli(["admin"], "/login?area=admin");

  // I dati dell'account (server-only) vengono caricati qui e passati allo
  // shell client, che li inoltra all'header per il menu utente.
  const account = await getDatiAccount();

  return <AdminShell account={account}>{children}</AdminShell>;
}
