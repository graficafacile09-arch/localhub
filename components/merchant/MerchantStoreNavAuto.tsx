"use client";

import { usePathname } from "next/navigation";
import MerchantSidebarNav from "./MerchantSidebarNav";

/**
 * Sidebar del negozio selezionato (desktop).
 *
 * Il layout dell'area venditore non conosce i segmenti figli, quindi non può
 * passare `currentStoreId` a MerchantShell. Questo wrapper deriva il negozio
 * direttamente dal percorso `/merchant/[negozioId]/...` e rende la stessa
 * navigazione (Dashboard, Prodotti, Ordini, Guadagni, Pagamenti, Media,
 * Impostazioni negozio, Duplica). Su percorsi senza negozio (es. /merchant
 * o /merchant/nuovo) non rende nulla.
 */
export default function MerchantStoreNavAuto({
  stores,
  reclamiApertiPerNegozio,
}: {
  stores: Array<{ id: string; nome: string }>;
  reclamiApertiPerNegozio?: Record<string, number>;
}) {
  const pathname = usePathname();
  const match = /^\/merchant\/([^/]+)/.exec(pathname);
  if (!match) return null;

  const storeId = match[1];
  if (storeId === "nuovo") return null;

  const store = stores.find((s) => s.id === storeId);
  if (!store) return null;

  return (
    <div className="card p-5">
      <p className="section-label">Navigazione</p>
      <div className="mt-4">
        <MerchantSidebarNav
          storeId={store.id}
          storeName={store.nome}
          reclamiAperti={reclamiApertiPerNegozio?.[store.id] ?? 0}
        />
      </div>
    </div>
  );
}
