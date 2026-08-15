"use client";

import { usePathname } from "next/navigation";
import MerchantSidebarNav from "./MerchantSidebarNav";

/**
 * Sidebar del negozio selezionato (desktop).
 *
 * Il layout dell'area venditore non conosce i segmenti figli, quindi non può
 * passare `currentStoreId` a MerchantShell (che di conseguenza non rendeva
 * MAI la navigazione del negozio su desktop). Questo wrapper deriva il negozio
 * direttamente dal percorso `/merchant/[negozioId]/...` e rende la stessa
 * navigazione (Dashboard, Prodotti, Ordini, Incassi, Payout, Pagamenti, …).
 * Su percorsi senza negozio (es. /merchant o /merchant/nuovo) non rende nulla.
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
    <MerchantSidebarNav
      storeId={store.id}
      storeName={store.nome}
      reclamiAperti={reclamiApertiPerNegozio?.[store.id] ?? 0}
    />
  );
}
