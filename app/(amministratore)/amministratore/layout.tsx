import type { ReactNode } from "react";
import AdminShell from "@/components/amministratore/AdminShell";
import { requireRole } from "@/lib/auth/session";

export const metadata = {
  title: "Amministratore — InCittà",
  description:
    "Pannello di amministrazione di LocalHub: gestione di attività, prodotti, contenuti e piattaforma.",
};

/**
 * Layout dell'area Amministratore.
 * FASE 7: accessibile SOLO agli utenti con ruolo admin.
 */
export default async function AmministratoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["admin"], "/login");

  return <AdminShell>{children}</AdminShell>;
}
