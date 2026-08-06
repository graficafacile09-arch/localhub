/**
 * Validazione della Partita IVA italiana (11 cifre + cifra di controllo
 * calcolata con l'algoritmo ufficiale).
 * Condivisa tra client (form di registrazione) e server (API).
 */

/** Rimuove spazi e trattini, che possono comparire nella digitazione. */
export function normalizzaPartitaIva(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isPartitaIvaValida(value: string): boolean {
  const piva = normalizzaPartitaIva(value);
  if (!/^\d{11}$/.test(piva)) return false;

  // Algoritmo ufficiale: le prime 10 cifre vengono moltiplicate in
  // alternanza per 1 e 2; i prodotti >9 vengono ridotti (2*n - 9).
  // La cifra di controllo è (10 - somma mod 10) mod 10.
  const pesi = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const prodotto = Number(piva[i]) * pesi[i];
    somma += prodotto > 9 ? prodotto - 9 : prodotto;
  }
  const cifraControllo = (10 - (somma % 10)) % 10;
  return cifraControllo === Number(piva[10]);
}

/**
 * Predisposizione per la verifica ufficiale della Partita IVA
 * (Agenzia delle Entrate / VIES).
 *
 * Oggi NON effettua alcuna chiamata esterna: la registrazione Venditore si
 * basa sul controllo algoritmico (isPartitaIvaValida). Quando in futuro
 * verrà collegato un servizio ufficiale, l'integrazione andrà aggiunta
 * esclusivamente qui (abilitando il flag) e resterà condivisa tra client
 * e server.
 */
export const VERIFICA_UFFICIALE_ABILITATA = false;

export type FonteVerificaPivaUfficiale = "agenzia-entrate" | "vies";

export interface EsitoVerificaPivaUfficiale {
  fonte: FonteVerificaPivaUfficiale;
  valida: boolean;
}

/**
 * Punto unico di integrazione futura con i servizi ufficiali.
 * Con il flag disattivo restituisce sempre null: nessuna chiamata esterna.
 */
export async function verificaPivaConServizioUfficiale(
  _piva: string,
): Promise<EsitoVerificaPivaUfficiale | null> {
  if (!VERIFICA_UFFICIALE_ABILITATA) return null;

  // TODO (fase futura): integrare l'endpoint ufficiale, es. VIES
  // (https://ec.europa.eu/taxation_customs/vies) o Agenzia delle Entrate.
  return null;
}
