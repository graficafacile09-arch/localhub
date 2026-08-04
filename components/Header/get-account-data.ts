import { getCurrentRuoli } from "@/lib/auth/session";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import type { DatiAccount } from "./AccountMenu";

/**
 * Carica i dati dell'account per il menu utente (header pubblico e header
 * dei pannelli). Basato sull'INSIEME dei ruoli posseduti: `ruoli` contiene
 * TUTTI i ruoli dell'utente (il webmaster ha admin+merchant+customer e vede
 * tutte e tre le aree), mentre `role` è il ruolo a priorità maggiore usato
 * per etichetta e destinazione predefinita.
 */
export async function getDatiAccount(): Promise<DatiAccount | null> {
  const auth = await getCurrentRuoli();
  if (!auth) return null;

  const { user, role, ruoli } = auth;
  const nome =
    String(user.user_metadata?.full_name ?? "").trim() ||
    String(user.email ?? "");

  let hasStores = false;
  let firstStoreId: string | null = null;

  // Merchant e admin (il webmaster) possono possedere negozi.
  if (ruoli.includes("merchant") || ruoli.includes("admin")) {
    const storesResult = await getMerchantStoresForUser(user.id);
    hasStores = storesResult.data.length > 0;
    firstStoreId = storesResult.data[0]?.id ?? null;
  }

  return {
    nome,
    email: user.email ?? "",
    role,
    ruoli,
    hasStores,
    firstStoreId,
  };
}
