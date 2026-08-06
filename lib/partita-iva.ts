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
