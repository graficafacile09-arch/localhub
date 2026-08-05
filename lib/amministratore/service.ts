import { getCategorie } from "@/lib/negozi";
import { getAttivitaAdmin } from "./attivita-queries";
import type { AttivitaRow } from "./attivita-types";
import { getUtentiReali } from "./utenti-queries";
import type { FiltroRuoloUtente, Utente } from "./types";

/**
 * Servizio utenti del pannello Amministratore.
 * Dati REALI dal database (auth.users + user_roles + profili + negozi).
 */

/** Elenco utenti con filtro opzionale per ruolo (tutti = nessun filtro). */
export async function getUtenti(
  filtro: FiltroRuoloUtente = "tutti"
): Promise<Utente[]> {
  return getUtentiReali(filtro);
}

/** Conteggi per le tab (tutti / amministratori / commercianti / utenti). */
export async function getConteggiUtenti(): Promise<
  Record<FiltroRuoloUtente, number>
> {
  const tutti = await getUtentiReali("tutti");
  return {
    tutti: tutti.length,
    amministratore: tutti.filter((u) => u.ruolo === "amministratore").length,
    commerciante: tutti.filter((u) => u.ruolo === "commerciante").length,
    utente: tutti.filter((u) => u.ruolo === "utente").length,
  };
}

// ─── Modulo Attività ────────────────────────────────────────────────────────

/** Elenco attività (negozi) per il centro di controllo Amministratore. */
export async function getAttivita(): Promise<AttivitaRow[]> {
  return getAttivitaAdmin();
}

/** Nomi delle categorie per il filtro (riusa getCategorie di lib/negozi). */
export async function getCategorieAttivita(): Promise<string[]> {
  const categorie = await getCategorie();
  return categorie.map((c) => c.nome).filter(Boolean);
}
