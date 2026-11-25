/**
 * IMMAGINI DEI PRODOTTI — un disegno (clipart SVG) per ogni voce del
 * calendario. I file stanno in `public/stagionalita/prodotti` e si chiamano
 * come l'id della voce: per aggiungere un prodotto basta salvare il file con
 * l'id giusto e aggiungerlo all'elenco qui sotto.
 *
 * L'elenco è esplicito di proposito: se l'immagine manca, il widget mostra
 * l'icona della categoria invece di un riquadro rotto.
 */

const CARTELLA = "/stagionalita/prodotti";

/** Id delle voci che hanno un'immagine disponibile. */
const VOCI_CON_IMMAGINE = new Set<string>([
  "clementine",
  "arance",
  "cipolla-tropea",
  "cipolla-bianca-castrovillari",
  "peperoncino",
  "ortaggi-estivi",
  "ortaggi-invernali",
  "cereali",
  "olive-da-olio",
  "pecorino-crotonese",
  "caciocavallo-silano",
  "latticini-tradizionali",
  "nduja",
  "soppressata",
  "capocollo-pancetta",
  "salsiccia",
  "vite",
  "miele",
  "castagne",
  "funghi",
  "noci-nocciole",
  "conserve-pomodoro",
  "sottoli",
  "essiccazione",
]);

/** Percorso dell'immagine del prodotto, oppure null se non c'è. */
export function immagineVoce(id: string): string | null {
  return VOCI_CON_IMMAGINE.has(id) ? `${CARTELLA}/${id}.svg` : null;
}
