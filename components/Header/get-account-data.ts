import { getSessionArea } from "@/lib/auth/session-area";
import { getMerchantStoresForUser } from "@/lib/merchant/data";
import type { DatiAccount } from "./AccountMenu";

/**
 * Carica i dati dell'account per il menu utente (header pubblico e header
 * dei pannelli). Le voci del menu NON derivano più dall'insieme dei ruoli:
 * derivano dall'AREA ATTIVA della sessione (cookie httpOnly lh_area), scelta
 * al login e fissa per tutta la sessione. `role`/`ruoli` restano disponibili
 * come informazione (etichetta, fallback), ma non determinano l'accesso.
 */
export async function getDatiAccount(): Promise<DatiAccount | null> {
  // Helper centrale dell'area attiva (stessa logica di proxy, layout e API).
  const sessione = await getSessionArea();
  if (!sessione) return null;

  const { user, role, ruoli, area } = sessione;

  const nome =
    String(user.user_metadata?.full_name ?? "").trim() ||
    String(user.email ?? "");

  let hasStores = false;

  // I negozi interessano SOLO la sessione merchant: il menu mostra
  // esclusivamente l'area attiva.
  if (area === "merchant") {
    const storesResult = await getMerchantStoresForUser(user.id);
    hasStores = storesResult.data.length > 0;
  }

  return {
    nome,
    email: user.email ?? "",
    role,
    ruoli,
    area,
    hasStores,
  };
}
