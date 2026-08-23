import type { ReactNode } from "react";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMerchantStoreForUser } from "@/lib/merchant/data";
import AdminStoreContext from "@/components/amministratore/AdminStoreContext";

/**
 * Layout del contesto negozio nell'Area Amministratore
 * (/amministratore/negozi/[negozioId]/...).
 * Risolve il problema di ORIENTAMENTO: breadcrumb (Amministrazione → Negozi
 * → [nome negozio]) + tab di navigazione del negozio (Dashboard, Editor,
 * Media, Prodotti, AI). Nessuna route modificata, nessuna funzione persa.
 */
export default async function AdminNegozioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ negozioId: string }>;
}) {
  const { negozioId } = await params;
  const user = await requireCurrentUser("/login");
  const storeResult = await getMerchantStoreForUser(user.id, negozioId);
  const storeName = storeResult.data?.nome ?? null;

  return (
    <div className="space-y-3">
      <AdminStoreContext storeId={negozioId} storeName={storeName} />
      {children}
    </div>
  );
}
