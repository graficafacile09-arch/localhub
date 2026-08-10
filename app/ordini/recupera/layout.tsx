import type { ReactNode } from "react";

export const metadata = {
  title: "Recupera i tuoi ordini — InCittà",
};

/**
 * Layout della pagina di recupero ordini guest: esporta i metadata (la
 * pagina è un client component e non può esportarli da sola).
 */
export default function RecuperaOrdiniLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
