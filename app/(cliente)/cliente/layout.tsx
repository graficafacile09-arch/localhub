import type { ReactNode } from "react";
import ClienteShell from "@/components/cliente/ClienteShell";
import { requireRuoli } from "@/lib/auth/session";

export const metadata = {
  title: "Area Clienti — LocalHub",
  description:
    "La tua area personale su LocalHub: ordini, preferiti, profilo e impostazioni.",
};

/**
 * Layout dell'Area Clienti.
 * Accessibile SOLO agli utenti che possiedono il ruolo customer (verifica
 * sull'insieme dei ruoli): merchant puri e admin puri vengono reindirizzati.
 * Il webmaster (customer+merchant+admin) mantiene l'accesso.
 */
export default async function ClienteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRuoli(["customer"], "/login?area=cliente");

  return <ClienteShell>{children}</ClienteShell>;
}
