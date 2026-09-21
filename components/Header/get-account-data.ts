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
  const storeName = String(user.user_metadata?.store_name ?? "").trim();
  const partitaIva = String(user.user_metadata?.partita_iva ?? "").trim();

  let hasStores = false;

  // Per una richiesta venditore pendente occorre verificare anche l'assenza
  // di negozi, pur restando nella sessione cliente. Per le altre sessioni si
  // conserva il caricamento precedente, limitato all'area merchant.
  const deveVerificareRichiesta =
    Boolean(storeName) && Boolean(partitaIva) && !ruoli.includes("merchant");
  if (area === "merchant" || deveVerificareRichiesta) {
    const storesResult = await getMerchantStoresForUser(user.id);
    hasStores = storesResult.data.length > 0;
  }

  const richiestaVenditore =
    Boolean(storeName) &&
    Boolean(partitaIva) &&
    !ruoli.includes("merchant") &&
    !hasStores;
  const profilo =
    role === "admin"
      ? "amministratore"
      : role === "merchant" || richiestaVenditore
        ? "venditore"
        : "acquirente";

  return {
    nome,
    email: user.email ?? "",
    profilo,
    role,
    ruoli,
    area,
    hasStores,
  };
}
