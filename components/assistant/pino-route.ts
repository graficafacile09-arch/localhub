/**
 * Pino widget — visibilità per rotta.
 *
 * Pino non deve comparire nelle pagine prodotto che mostrano il pulsante
 * «Acquista» né durante il flusso di acquisto: evita che il widget copra i
 * controlli o distragga mentre l'utente sta scegliendo o comprando un prodotto.
 *
 * Rotte escluse:
 *  - /prodotto/<slug>                       (scheda prodotto con «Acquista»)
 *  - /prodotto/<slug>/acquista[/...]        (flusso di acquisto)
 *  - /carrello
 *  - /checkout
 *  - /ordini/conferma/<id>
 *
 * Le altre pagine, inclusa la homepage, le aree amministratore/merchant e lo
 * storico ordini (/ordini), mantengono il comportamento esistente.
 */

const PREFIXI_TRANSIZIONALI = ["/carrello", "/checkout", "/ordini/conferma"] as const;

/** Scheda prodotto: /prodotto/<slug>. */
const RE_DETTAGLIO_PRODOTTO = /^\\/prodotto\\/[^/]+$/;

/** Percorso di acquisto: /prodotto/<slug>/acquista[/...]. */
const RE_ACQUISTA = /^\\/prodotto\\/[^/]+\\/acquista(?:\\/|$)/;

/**
 * `true` quando Pino deve restare nascosto. Accetta pathname null durante
 * l'hydration e ignora query string e slash finale.
 */
export function isPinoTransactionalRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const percorso = (pathname.split("?")[0] || "/").replace(/\\/+$/, "") || "/";

  for (const prefisso of PREFIXI_TRANSIZIONALI) {
    if (percorso === prefisso || percorso.startsWith(prefisso + "/")) return true;
  }

  return RE_DETTAGLIO_PRODOTTO.test(percorso) || RE_ACQUISTA.test(percorso);
}
