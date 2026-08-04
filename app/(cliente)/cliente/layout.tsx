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
  await requireRuoli(["customer"], "/login?redirect=/cliente");

  return (
    <>
      <div style={{background:"#16a34a",color:"white",padding:"20px",textAlign:"center",fontSize:"28px",fontWeight:"900",fontFamily:"monospace",position:"sticky",top:0,zIndex:9999}}>
        ═══ CLIENT LAYOUT ═══ app/(cliente)/cliente/layout.tsx ═══
      </div>
      <ClienteShell>{children}</ClienteShell>
    </>
  );
}
