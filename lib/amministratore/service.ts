import { utentiDemo } from "./demo-utenti";
import type { FiltroRuoloUtente, Utente } from "./types";

/**
 * Servizio utenti del pannello Amministratore.
 *
 * In questa fase restituisce dati DEMO; il contratto delle funzioni è già
 * pensato per essere collegato al database nelle prossime fasi senza dover
 * toccare i componenti: basterà sostituire l'implementazione interna.
 */

/** Elenco utenti con filtro opzionale per ruolo (null = tutti). */
export async function getUtenti(
  filtro: FiltroRuoloUtente = "tutti"
): Promise<Utente[]> {
  // TODO(fase successiva): leggere da database (auth.users + profili).
  if (filtro === "tutti") return utentiDemo;
  return utentiDemo.filter((utente) => utente.ruolo === filtro);
}

/** Conteggi per le tab (tutti / amministratori / commercianti / utenti). */
export async function getConteggiUtenti(): Promise<
  Record<FiltroRuoloUtente, number>
> {
  const tutti = await getUtenti("tutti");
  return {
    tutti: tutti.length,
    amministratore: tutti.filter((u) => u.ruolo === "amministratore").length,
    commerciante: tutti.filter((u) => u.ruolo === "commerciante").length,
    utente: tutti.filter((u) => u.ruolo === "utente").length,
  };
}
