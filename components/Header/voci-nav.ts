/**
 * Voci della navigazione pubblica, in un unico posto.
 *
 * Sono le stesse sezioni già presenti nel menu del sito (nessuna nuova voce,
 * nessun nome cambiato): l'header della homepage continua a usare la sua
 * `HeaderNav`, mentre la barra compatta delle pagine interne e il suo menu
 * mobile leggono questo elenco.
 */
export type VoceNavigazione = { label: string; href: string };

export const VOCI_NAV: VoceNavigazione[] = [
  { label: "Home", href: "/" },
  { label: "Aziende", href: "/negozi" },
  { label: "TerraQ", href: "/prodotti" },
  { label: "Filiere", href: "/filiere" },
  { label: "Territorio", href: "/territorio" },
  { label: "Notizie", href: "/notizie" },
];

/** True quando la rotta corrente appartiene alla sezione della voce. */
export function voceAttiva(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
